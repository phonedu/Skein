//! The sizes and failures the hand-run acceptance list asks for: 20,000
//! files, a 128 MiB file, a dropped run and a transient upload failure.

use async_trait::async_trait;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use textus_sync::protocol::{History, Manifest, HEAD_KEY, LOCK_KEY, MAX_MANIFEST_SIZE};
use textus_sync::{
    sync, LocalFiles, MemoryLocal, MemoryStore, ObjectStore, SyncError, SyncOptions,
};

fn options() -> SyncOptions {
    SyncOptions {
        base: textus_sync::Base::empty(),
        device: "desktop-test".to_string(),
        keep_days: 90,
        keep_chosen: false,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    }
}

fn twenty_thousand() -> std::collections::BTreeMap<String, Vec<u8>> {
    (0..20_000)
        .map(|index| {
            (
                format!("Notes/{index:05}.md"),
                format!("note {index}\n").into_bytes(),
            )
        })
        .collect()
}

#[tokio::test]
async fn twenty_thousand_files_sync_and_one_change_uploads_one() {
    let store = MemoryStore::new();
    let files = twenty_thousand();
    let first = sync(&store, &MemoryLocal::new(files.clone()), options())
        .await
        .unwrap();
    assert_eq!(first.result.uploaded, 20_000);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files.len(), 20_000);

    let mut edited = files;
    edited.insert("Notes/00042.md".to_string(), b"changed\n".to_vec());
    let mut second_options = options();
    second_options.base = first.base.clone();
    let second = sync(&store, &MemoryLocal::new(edited), second_options)
        .await
        .unwrap();
    assert_eq!(second.result.uploaded, 1);
    assert_eq!(second.result.downloaded, 0);
}

#[tokio::test]
async fn a_hundred_and_twenty_eight_mib_file_round_trips() {
    let size = 128 * 1024 * 1024;
    let bytes = vec![0xA5u8; size];
    let store = MemoryStore::new();
    let local = MemoryLocal::new([("Assets/big.md".to_string(), bytes)]);
    let uploaded = sync(&store, &local, options()).await.unwrap();
    assert_eq!(uploaded.result.uploaded, 1);
    drop(local);

    let other = MemoryLocal::new([]);
    let downloaded = sync(&store, &other, options()).await.unwrap();
    assert_eq!(downloaded.result.downloaded, 1);
    assert_eq!(
        other.read("Assets/big.md").await.unwrap().unwrap().len(),
        size
    );
}

/// A run that is killed while a block is in flight leaves the remote lock
/// behind. The next run must refuse to plan over it, and after a manual
/// unlock the same local files finish without duplicate history.
struct HangingAfterLock {
    inner: MemoryStore,
    hung: AtomicBool,
    reached: std::sync::Mutex<Option<tokio::sync::mpsc::Sender<()>>>,
}

impl HangingAfterLock {
    fn new() -> Self {
        Self {
            inner: MemoryStore::new(),
            hung: AtomicBool::new(false),
            reached: std::sync::Mutex::new(None),
        }
    }

    fn sender(&self) -> tokio::sync::mpsc::Receiver<()> {
        let (sender, receiver) = tokio::sync::mpsc::channel(1);
        *self.reached.lock().unwrap_or_else(|e| e.into_inner()) = Some(sender);
        receiver
    }
}

#[async_trait]
impl ObjectStore for HangingAfterLock {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        self.inner.get(key).await
    }
    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }
    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
        if key.starts_with("v1/blocks/") && !self.hung.swap(true, Ordering::SeqCst) {
            let sender = self
                .reached
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            if let Some(sender) = sender {
                let _ = sender.send(()).await;
            }
            std::future::pending::<()>().await;
        }
        self.inner.put(key, bytes).await
    }
    async fn create(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<bool> {
        self.inner.create(key, bytes).await
    }
    async fn delete(&self, key: &str) -> textus_sync::Result<()> {
        self.inner.delete(key).await
    }
}

#[tokio::test]
async fn a_killed_run_keeps_the_lock_and_finishes_after_unlock() {
    let store = Arc::new(HangingAfterLock::new());
    let mut reached = store.sender();
    let running = {
        let store = Arc::clone(&store);
        tokio::spawn(async move {
            let local = MemoryLocal::new([("a.md".to_string(), b"one".to_vec())]);
            sync(store.as_ref(), &local, options()).await
        })
    };
    reached.recv().await.unwrap();
    running.abort();
    let _ = running.await;

    assert!(store.inner.get(LOCK_KEY).await.unwrap().is_some());
    let refused = sync(
        store.as_ref(),
        &MemoryLocal::new([("a.md".to_string(), b"one".to_vec())]),
        options(),
    )
    .await
    .unwrap_err();
    assert_eq!(refused.code, "locked");

    store.inner.delete(LOCK_KEY).await.unwrap();
    let finished = sync(
        store.as_ref(),
        &MemoryLocal::new([("a.md".to_string(), b"one".to_vec())]),
        options(),
    )
    .await
    .unwrap();
    assert_eq!(finished.result.uploaded, 1);
    let history = History::parse(
        &store
            .inner
            .get(textus_sync::protocol::HISTORY_KEY)
            .await
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert!(history.current.contains_key("a.md"));
    assert_eq!(
        history.head.as_deref(),
        Some(finished.result.revision.as_str())
    );
}

/// One block upload fails the way a 5xx or dropped connection does. The
/// lock is released and the next run publishes one version, not two.
struct FailFirstUpload {
    inner: MemoryStore,
    failed: AtomicBool,
}

impl FailFirstUpload {
    fn new() -> Self {
        Self {
            inner: MemoryStore::new(),
            failed: AtomicBool::new(false),
        }
    }
}

#[async_trait]
impl ObjectStore for FailFirstUpload {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        self.inner.get(key).await
    }
    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }
    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
        if key.starts_with("v1/blocks/") && !self.failed.swap(true, Ordering::SeqCst) {
            return Err(SyncError::new("httpError"));
        }
        self.inner.put(key, bytes).await
    }
    async fn create(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<bool> {
        self.inner.create(key, bytes).await
    }
    async fn delete(&self, key: &str) -> textus_sync::Result<()> {
        self.inner.delete(key).await
    }
}

#[tokio::test]
async fn a_transient_upload_failure_releases_the_lock_and_retry_publishes_once() {
    let store = FailFirstUpload::new();
    let local = MemoryLocal::new([("a.md".to_string(), b"one".to_vec())]);
    let failed = sync(&store, &local, options()).await.unwrap_err();
    assert_eq!(failed.code, "httpError");
    assert!(store.inner.get(LOCK_KEY).await.unwrap().is_none());

    let retried = sync(&store, &local, options()).await.unwrap();
    assert_eq!(retried.result.uploaded, 1);

    local.set("a.md", b"two".to_vec());
    let mut second = options();
    second.base = retried.base;
    sync(&store, &local, second).await.unwrap();
    let history = History::parse(
        &store
            .inner
            .get(textus_sync::protocol::HISTORY_KEY)
            .await
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(history.versions["a.md"].len(), 1);
}

#[tokio::test]
async fn twenty_thousand_identified_files_stay_within_the_manifest_limit() {
    let files: std::collections::BTreeMap<String, Vec<u8>> = (0..20_000)
        .map(|index| {
            let id = uuid::Uuid::from_u128(index as u128 + 1).to_string();
            (
                format!("Notes/{index:05}.md"),
                format!(
                    "---
textus_id: {id}
---
note {index}
"
                )
                .into_bytes(),
            )
        })
        .collect();
    let store = MemoryStore::new();
    let started = std::time::Instant::now();
    let first = sync(&store, &MemoryLocal::new(files), options())
        .await
        .unwrap();
    assert_eq!(first.result.uploaded, 20_000);
    let raw = store.get(HEAD_KEY).await.unwrap().unwrap();
    assert!(
        raw.len() < MAX_MANIFEST_SIZE,
        "manifest {} bytes",
        raw.len()
    );
    let head = Manifest::parse(&raw).unwrap();
    assert_eq!(head.files.len(), 20_000);
    assert!(head.files.values().all(|entry| entry.id.is_some()));
    eprintln!(
        "20k with ids: manifest {} bytes, first sync {:?}",
        raw.len(),
        started.elapsed()
    );
}
