//! The engine over the in-memory store and folder: first sync, download,
//! conflict, lock, empty scan and deletion.

use chrono::Utc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use textus_sync::chunk::{describe, hash_hex};
use textus_sync::protocol::{
    block_key, new_revision, Lock, Trashed, HEAD_KEY, HISTORY_KEY, LOCK_KEY,
};
use textus_sync::{
    preview, sync, Base, History, LocalFiles, Manifest, MemoryLocal, MemoryStore, ObjectStore,
    SyncError, SyncOptions,
};

fn local(items: &[(&str, &str)]) -> MemoryLocal {
    MemoryLocal::new(
        items
            .iter()
            .map(|(path, body)| (path.to_string(), body.as_bytes().to_vec())),
    )
}

const DOC_ID: &str = "5f1c9a2e-4b7d-4c8a-9e3f-1a2b3c4d5e6f";

fn doc(body: &str) -> Vec<u8> {
    doc_with_id(DOC_ID, body)
}

fn doc_with_id(id: &str, body: &str) -> Vec<u8> {
    format!(
        "---
textus_id: {id}
---
{body}"
    )
    .into_bytes()
}

fn options() -> SyncOptions {
    SyncOptions {
        base: Base::empty(),
        device: "desktop-test".to_string(),
        keep_days: 90,
        keep_chosen: false,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    }
}

#[tokio::test]
async fn first_sync_uploads_and_publishes() {
    let store = MemoryStore::new();
    let files = local(&[("Notes/a.md", "hello")]);
    let outcome = sync(&store, &files, options()).await.unwrap();
    assert_eq!(outcome.result.uploaded, 1);
    assert!(outcome.result.revision.len() > 8);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["Notes/a.md"].size, 5);
    assert!(store.get(LOCK_KEY).await.unwrap().is_none());
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(history.head.as_deref(), Some(head.revision.as_str()));
}

#[tokio::test]
async fn second_device_downloads() {
    let store = MemoryStore::new();
    sync(&store, &local(&[("a.md", "one")]), options())
        .await
        .unwrap();
    let other = local(&[]);
    let outcome = sync(&store, &other, options()).await.unwrap();
    assert_eq!(outcome.result.downloaded, 1);
    assert_eq!(other.read("a.md").await.unwrap(), Some(b"one".to_vec()));
}

#[tokio::test]
async fn a_conflict_keeps_both_copies() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "base")]);
    let out = sync(&store, &first, options()).await.unwrap();

    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let remote = describe(b"remote").unwrap();
    store
        .put(&block_key(&remote.blocks[0].hash), b"remote".to_vec())
        .await
        .unwrap();
    head.files.insert("a.md".to_string(), remote);
    head.revision = new_revision();
    head.updated_at = "2026-11-19T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    first.set("a.md", b"local".to_vec());
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(first.read("a.md").await.unwrap(), Some(b"local".to_vec()));
    assert_eq!(next.result.conflicts.len(), 1);
    assert!(first.has(&next.result.conflicts[0]));
    let local_hash = describe(b"local").unwrap().hash;
    let remote_hash = describe(b"remote").unwrap().hash;
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].hash, local_hash);
    assert_eq!(head.files[&next.result.conflicts[0]].hash, remote_hash);

    // The run after a conflict must not "download" the remote version over
    // the local edit: the original path now carries this device's bytes.
    let settled = sync(
        &store,
        &first,
        SyncOptions {
            base: next.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert!(settled.result.conflicts.is_empty());
    assert_eq!(settled.result.downloaded, 0);
    assert_eq!(first.read("a.md").await.unwrap(), Some(b"local".to_vec()));
}

#[tokio::test]
async fn a_vanished_remote_head_is_not_a_folder_to_empty() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    store.delete(HEAD_KEY).await.unwrap();
    let error = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, "remoteMissing");
    assert!(first.has("a.md"));
}

#[tokio::test]
async fn a_lock_held_by_another_run_stops_before_writing() {
    let store = MemoryStore::new();
    store
        .create(
            LOCK_KEY,
            Lock {
                id: "other".to_string(),
                started_at: "now".to_string(),
            }
            .to_json()
            .unwrap(),
        )
        .await
        .unwrap();
    let error = sync(&store, &local(&[("a.md", "x")]), options())
        .await
        .unwrap_err();
    assert_eq!(error.code, "locked");
    assert!(store.get(HEAD_KEY).await.unwrap().is_none());
    assert!(store.get(LOCK_KEY).await.unwrap().is_some());
}

#[tokio::test]
async fn an_empty_scan_over_a_synced_folder_stops() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    let empty = local(&[]);
    let error = sync(
        &store,
        &empty,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, "emptyScan");
}

#[tokio::test]
async fn deleting_a_missing_remote_file_is_a_remote_delete() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    first.delete("a.md");
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            allow_empty_scan: true,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(next.result.removed, 1);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert!(head.files.is_empty());
}

#[tokio::test]
async fn an_unchanged_second_run_does_not_publish_a_revision() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    let published = out.result.revision.clone();
    let before = store.get(HEAD_KEY).await.unwrap().unwrap();

    let settled = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(settled.result.revision, published);
    assert_eq!(store.get(HEAD_KEY).await.unwrap().unwrap(), before);
}

#[tokio::test]
async fn a_corrupt_history_stops_the_run_instead_of_starting_over() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    store.put(HISTORY_KEY, b"{".to_vec()).await.unwrap();
    let error = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, "invalidHistory");
    assert_eq!(store.get(HISTORY_KEY).await.unwrap().unwrap(), b"{");
}

#[tokio::test]
async fn a_replaced_file_keeps_its_previous_content_as_a_version() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    first.set("a.md", b"two".to_vec());
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(history.head.as_deref(), Some(next.result.revision.as_str()));
    let versions = &history.versions["a.md"];
    assert_eq!(versions.len(), 1);
    assert_eq!(versions[0].entry.hash, hash_hex(b"one"));
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(versions[0].until.as_deref(), Some(head.updated_at.as_str()));
    assert_eq!(
        history.current["a.md"].device.as_deref(),
        Some("desktop-test")
    );
}

#[tokio::test]
async fn another_devices_keep_setting_is_not_reset_by_a_default_run() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    let mut history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    history.keep.days = 365;
    store
        .put(HISTORY_KEY, history.to_json().unwrap())
        .await
        .unwrap();

    let settled = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base.clone(),
            ..options()
        },
    )
    .await
    .unwrap();
    let kept = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(kept.keep.days, 365);
    assert_eq!(settled.result.revision, out.result.revision);

    let chosen = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            keep_days: 30,
            keep_chosen: true,
            ..options()
        },
    )
    .await
    .unwrap();
    let changed = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(changed.keep.days, 30);
    assert_ne!(chosen.result.revision, settled.result.revision);
}

#[tokio::test]
async fn a_head_written_after_the_history_is_folded_in() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    let old = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();

    // An older client writes a head without a history (or a run died
    // between the two writes).
    let next = describe(b"two").unwrap();
    store
        .put(&block_key(&next.blocks[0].hash), b"two".to_vec())
        .await
        .unwrap();
    let mut head = old.clone();
    head.files.insert("a.md".to_string(), next.clone());
    head.revision = new_revision();
    head.updated_at = "2026-11-20T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    let outcome = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(
        history.head.as_deref(),
        Some(outcome.result.revision.as_str())
    );
    let versions = &history.versions["a.md"];
    let hashes: Vec<&str> = versions.iter().map(|v| v.entry.hash.as_str()).collect();
    assert_eq!(hashes, [hash_hex(b"one").as_str()]);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].hash, hash_hex(b"two"));
}

#[tokio::test]
async fn old_trash_entries_age_out_of_the_head() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    let out = sync(&store, &first, options()).await.unwrap();
    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let entry = head.files["a.md"].clone();
    head.trash = vec![
        Trashed {
            path: "old.md".to_string(),
            deleted_at: "2020-01-01T00:00:00.000Z".to_string(),
            entry: entry.clone(),
        },
        Trashed {
            path: "new.md".to_string(),
            deleted_at: Utc::now().to_rfc3339(),
            entry,
        },
    ];
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.trash.len(), 1);
    assert_eq!(head.trash[0].path, "new.md");
}

#[tokio::test]
async fn case_folded_twins_between_devices_stop_before_transfer() {
    let store = MemoryStore::new();
    let upper = local(&[("A.md", "upper")]);
    sync(&store, &upper, options()).await.unwrap();
    let lower = local(&[("a.md", "lower")]);
    let error = sync(&store, &lower, options()).await.unwrap_err();
    assert_eq!(error.code, "caseCollision");
    assert_eq!(lower.read("a.md").await.unwrap(), Some(b"lower".to_vec()));
}

struct FailingHead {
    inner: MemoryStore,
}

#[async_trait::async_trait]
impl ObjectStore for FailingHead {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        self.inner.get(key).await
    }
    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }
    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
        if key == HEAD_KEY {
            return Err(SyncError::new("networkError"));
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
async fn a_publish_that_dies_before_the_head_retries_without_duplicate_versions() {
    let store = MemoryStore::new();
    let local = local(&[("a.md", "one")]);
    let first = sync(&store, &local, options()).await.unwrap();

    local.set("a.md", b"two".to_vec());
    let failing = FailingHead {
        inner: MemoryStore::new(),
    };
    // Seed the failing store with the published repository.
    for key in store.keys() {
        failing
            .inner
            .put(&key, store.get(&key).await.unwrap().unwrap())
            .await
            .unwrap();
    }
    let error = sync(
        &failing,
        &local,
        SyncOptions {
            base: first.base.clone(),
            ..options()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, "publishFailed");
    assert!(failing.inner.get(LOCK_KEY).await.unwrap().is_some());
    let head = Manifest::parse(&failing.inner.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].hash, hash_hex(b"one"));

    failing.inner.delete(LOCK_KEY).await.unwrap();
    let working = MemoryStore::new();
    for key in failing.inner.keys() {
        working
            .put(&key, failing.inner.get(&key).await.unwrap().unwrap())
            .await
            .unwrap();
    }
    let retried = sync(
        &working,
        &local,
        SyncOptions {
            base: first.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(retried.result.uploaded, 1);
    let history = History::parse(&working.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    let ones = history.versions["a.md"]
        .iter()
        .filter(|version| version.entry.hash == hash_hex(b"one"))
        .count();
    assert_eq!(ones, 1, "{:?}", history.versions["a.md"]);
}

/// A head read-back that fails, or sees the previous head, only after the
/// publish wrote it. The rest of the store behaves normally.
struct FlakyHead {
    inner: MemoryStore,
    remaining: AtomicUsize,
    stale: AtomicBool,
    armed: AtomicBool,
}

#[async_trait::async_trait]
impl ObjectStore for FlakyHead {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        if key == HEAD_KEY && self.armed.load(Ordering::SeqCst) {
            if self.remaining.load(Ordering::SeqCst) > 0 {
                self.remaining.fetch_sub(1, Ordering::SeqCst);
                return Err(SyncError::new("networkError"));
            }
            if self.stale.load(Ordering::SeqCst) {
                return Ok(Some(b"an older head".to_vec()));
            }
        }
        self.inner.get(key).await
    }
    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }
    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
        self.inner.put(key, bytes).await?;
        if key == HEAD_KEY {
            self.armed.store(true, Ordering::SeqCst);
        }
        Ok(())
    }
    async fn create(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<bool> {
        self.inner.create(key, bytes).await
    }
    async fn delete(&self, key: &str) -> textus_sync::Result<()> {
        self.inner.delete(key).await
    }
}

#[tokio::test]
async fn a_transient_head_read_after_publish_is_retried() {
    let store = FlakyHead {
        inner: MemoryStore::new(),
        remaining: AtomicUsize::new(2),
        stale: AtomicBool::new(false),
        armed: AtomicBool::new(false),
    };
    let outcome = sync(&store, &local(&[("a.md", "one")]), options())
        .await
        .unwrap();
    assert_eq!(outcome.result.uploaded, 1);
    assert!(store.inner.get(LOCK_KEY).await.unwrap().is_none());
}

#[tokio::test]
async fn a_persistently_stale_head_still_fails_and_keeps_the_lock() {
    let store = FlakyHead {
        inner: MemoryStore::new(),
        remaining: AtomicUsize::new(0),
        stale: AtomicBool::new(true),
        armed: AtomicBool::new(false),
    };
    let error = sync(&store, &local(&[("a.md", "one")]), options())
        .await
        .unwrap_err();
    assert_eq!(error.code, "publishFailed");
    assert!(store.inner.get(LOCK_KEY).await.unwrap().is_some());
}

#[tokio::test]
async fn a_corrupt_block_stops_the_download_before_it_writes() {
    let store = MemoryStore::new();
    let first = local(&[("a.md", "one")]);
    sync(&store, &first, options()).await.unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let key = block_key(&head.files["a.md"].blocks[0].hash);
    store.put(&key, b"rotten".to_vec()).await.unwrap();

    let other = local(&[]);
    let error = sync(&store, &other, options()).await.unwrap_err();
    assert_eq!(error.code, "missingBlock");
    assert!(!other.has("a.md"));
    assert!(store.get(LOCK_KEY).await.unwrap().is_none());
}

struct LyingLock {
    inner: MemoryStore,
}

#[async_trait::async_trait]
impl ObjectStore for LyingLock {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        self.inner.get(key).await
    }
    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }
    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
        self.inner.put(key, bytes).await
    }
    async fn create(&self, _key: &str, _bytes: Vec<u8>) -> textus_sync::Result<bool> {
        // A store that answers yes without keeping the object.
        Ok(true)
    }
    async fn delete(&self, key: &str) -> textus_sync::Result<()> {
        self.inner.delete(key).await
    }
}

#[tokio::test]
async fn a_lock_that_was_not_really_stored_stops_before_planning() {
    let store = LyingLock {
        inner: MemoryStore::new(),
    };
    let local = local(&[("a.md", "one")]);
    let error = sync(&store, &local, options()).await.unwrap_err();
    assert_eq!(error.code, "lockLost");
    assert!(store.inner.get(HEAD_KEY).await.unwrap().is_none());
}

#[tokio::test]
async fn a_first_connect_preview_counts_the_upload_without_writing() {
    let store = MemoryStore::new();
    let local = local(&[("a.md", "hello")]);
    let result = preview(&store, &local, &options()).await.unwrap();
    assert_eq!(result.uploaded, 1);
    assert_eq!(result.upload_bytes, 5);
    assert_eq!(result.downloaded, 0);
    assert!(store.get(HEAD_KEY).await.unwrap().is_none());
    assert!(store.get(LOCK_KEY).await.unwrap().is_none());
}

#[tokio::test]
async fn a_preview_shows_conflicts_and_the_empty_scan_guard() {
    let store = MemoryStore::new();
    let remote = local(&[("a.md", "remote")]);
    sync(&store, &remote, options()).await.unwrap();
    let edited = local(&[("a.md", "local")]);
    let result = preview(&store, &edited, &options()).await.unwrap();
    assert_eq!(result.conflicts, 1);

    let empty = local(&[]);
    let result = preview(
        &store,
        &empty,
        &SyncOptions {
            base: Base {
                format: "textus-cloud-sync/1".to_string(),
                files: [("a.md".to_string(), hash_hex(b"remote"))].into(),
                parked: Default::default(),
            },
            ..options()
        },
    )
    .await
    .unwrap();
    assert!(result.empty_scan);
    assert_eq!(result.removed_remote, 1);
}

#[tokio::test]
async fn a_renamed_and_edited_document_keeps_its_id_and_history() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    first.delete("a.md");
    first.set("b.md", doc("two"));
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();

    assert_eq!(next.result.conflicts, Vec::<String>::new());
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert!(!head.files.contains_key("a.md"));
    assert_eq!(head.files["b.md"].id.as_deref(), Some(DOC_ID));
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert!(history.versions["b.md"]
        .iter()
        .any(|version| version.entry.hash == hash_hex(&doc("one"))));
    assert_eq!(next.base.files.get("b.md"), Some(&hash_hex(&doc("two"))));
}

#[tokio::test]
async fn a_remote_rename_keeps_the_local_edit_at_the_new_path() {
    let store = MemoryStore::new();
    let device_a = local(&[]);
    device_a.set("a.md", doc("one"));
    let first = sync(&store, &device_a, options()).await.unwrap();

    // B has the same document and edits it under the old path.
    let device_b = local(&[]);
    device_b.set("a.md", doc("edited-on-b"));
    // A renames it first, without changing the body.
    device_a.delete("a.md");
    device_a.set("b.md", doc("one"));
    sync(
        &store,
        &device_a,
        SyncOptions {
            base: first.base.clone(),
            ..options()
        },
    )
    .await
    .unwrap();

    let next = sync(
        &store,
        &device_b,
        SyncOptions {
            base: first.base,
            ..options()
        },
    )
    .await
    .unwrap();

    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert!(!head.files.contains_key("a.md"));
    assert_eq!(head.files["b.md"].id.as_deref(), Some(DOC_ID));
    assert_eq!(
        device_b.read("b.md").await.unwrap(),
        Some(doc("edited-on-b"))
    );
    assert_eq!(
        head.files["b.md"].hash,
        hash_hex(&doc("edited-on-b")),
        "B's edit is what the one surviving path holds"
    );
    assert!(next.result.conflicts.is_empty());
}

#[tokio::test]
async fn an_old_client_dropping_entry_ids_has_them_rebuilt_from_the_file() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    for entry in head.files.values_mut() {
        entry.id = None;
    }
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let rebuilt = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(rebuilt.files["a.md"].id.as_deref(), Some(DOC_ID));
}

#[tokio::test]
async fn a_file_without_an_id_still_syncs_by_path() {
    let store = MemoryStore::new();
    let first = local(&[("plain.md", "no id here")]);
    sync(&store, &first, options()).await.unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["plain.md"].id, None);
}

#[tokio::test]
async fn losing_the_front_matter_id_does_not_lose_the_content_or_history() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    first.set(
        "a.md",
        b"---
title: rewritten
---
one"
        .to_vec(),
    );
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(next.result.conflicts, Vec::<String>::new());
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id, None);
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert!(history.versions["a.md"]
        .iter()
        .any(|version| version.entry.hash == hash_hex(&doc("one"))));
}

#[tokio::test]
async fn deleting_and_restoring_a_document_reuses_its_id() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    first.delete("a.md");
    let empty = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            allow_empty_scan: true,
            ..options()
        },
    )
    .await
    .unwrap();
    let restored = local(&[]);
    restored.set("a.md", doc("one"));
    sync(
        &store,
        &restored,
        SyncOptions {
            base: empty.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id.as_deref(), Some(DOC_ID));
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert!(history.versions["a.md"]
        .iter()
        .any(|version| version.entry.hash == hash_hex(&doc("one"))));
}

#[tokio::test]
async fn changing_the_id_is_a_new_identity_at_the_same_path() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    let replacement = "0b5c7e7a-2f7e-4f1f-9a6b-8d2c3e4f5a6b";
    first.set(
        "a.md",
        format!(
            "---
textus_id: {replacement}
---
one"
        )
        .into_bytes(),
    );
    sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id.as_deref(), Some(replacement));
    let history = History::parse(&store.get(HISTORY_KEY).await.unwrap().unwrap()).unwrap();
    assert!(history.versions["a.md"]
        .iter()
        .any(|version| version.entry.hash == hash_hex(&doc("one"))));
}

#[tokio::test]
async fn a_copy_with_one_id_gets_a_new_id() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    first.set("copy.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();
    assert_eq!(out.result.conflicts, Vec::<String>::new());
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let a = head.files["a.md"].id.as_deref();
    let copy = head.files["copy.md"].id.as_deref();
    assert!(a.is_some());
    assert!(copy.is_some());
    assert_ne!(a, copy);
    assert_eq!(first.read("a.md").await.unwrap(), Some(doc("one")));
    let copy_text = String::from_utf8(first.read("copy.md").await.unwrap().unwrap()).unwrap();
    assert!(!copy_text.contains(DOC_ID));
}

#[tokio::test]
async fn an_unchanged_side_adopts_the_id_the_other_side_published() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();
    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let replacement = "0b5c7e7a-2f7e-4f1f-9a6b-8d2c3e4f5a6b";
    let remote_bytes = doc_with_id(replacement, "remote");
    let remote = describe(&remote_bytes).unwrap();
    store
        .put(&block_key(&remote.blocks[0].hash), remote_bytes.clone())
        .await
        .unwrap();
    head.files.insert("a.md".to_string(), remote);
    head.revision = new_revision();
    head.updated_at = "2026-11-21T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id.as_deref(), Some(replacement));
    assert_eq!(first.read("a.md").await.unwrap(), Some(remote_bytes));
}

#[tokio::test]
async fn both_sides_changing_the_id_stop_before_one_is_lost() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();
    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let replacement = "0b5c7e7a-2f7e-4f1f-9a6b-8d2c3e4f5a6b";
    let remote_bytes = doc_with_id(replacement, "remote");
    let remote = describe(&remote_bytes).unwrap();
    store
        .put(&block_key(&remote.blocks[0].hash), remote_bytes)
        .await
        .unwrap();
    head.files.insert("a.md".to_string(), remote);
    head.revision = new_revision();
    head.updated_at = "2026-11-21T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();
    first.set("a.md", doc("local-edit"));

    let error = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, "identityConflict");
}

#[tokio::test]
async fn a_conflict_copy_gets_a_new_id() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    let remote_bytes = doc("remote");
    let remote = describe(&remote_bytes).unwrap();
    store
        .put(&block_key(&remote.blocks[0].hash), remote_bytes.clone())
        .await
        .unwrap();
    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    head.files.insert("a.md".to_string(), remote);
    head.revision = new_revision();
    head.updated_at = "2026-11-21T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    first.set("a.md", doc("local"));
    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(next.result.conflicts.len(), 1);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id.as_deref(), Some(DOC_ID));
    let copy = &head.files[&next.result.conflicts[0]];
    assert!(copy.id.is_some());
    assert_ne!(copy.id.as_deref(), Some(DOC_ID));
    let copy_bytes = first
        .read(&next.result.conflicts[0])
        .await
        .unwrap()
        .unwrap();
    let copy_text = String::from_utf8(copy_bytes).unwrap();
    assert!(copy_text.contains("remote"));
    assert!(!copy_text.contains(DOC_ID));
}

#[tokio::test]
async fn two_different_renames_keep_both_documents_with_new_ids() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();

    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let entry = head.files.remove("a.md").unwrap();
    head.files.insert("right.md".to_string(), entry);
    head.revision = new_revision();
    head.updated_at = "2026-11-21T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    first.delete("a.md");
    first.set("left.md", doc("one"));
    sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["right.md"].id.as_deref(), Some(DOC_ID));
    assert!(head.files["left.md"].id.is_some());
    assert_ne!(head.files["left.md"].id.as_deref(), Some(DOC_ID));
    let left_text = String::from_utf8(first.read("left.md").await.unwrap().unwrap()).unwrap();
    assert!(left_text.contains("one"));
    assert!(!left_text.contains(DOC_ID));
    assert_eq!(first.read("right.md").await.unwrap(), Some(doc("one")));
}

#[tokio::test]
async fn two_remote_copies_with_one_id_get_a_new_id() {
    let store = MemoryStore::new();
    let first = local(&[]);
    first.set("a.md", doc("one"));
    let out = sync(&store, &first, options()).await.unwrap();
    let mut head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    let entry = head.files["a.md"].clone();
    head.files.insert("copy.md".to_string(), entry);
    head.revision = new_revision();
    head.updated_at = "2026-11-21T00:00:00.000Z".to_string();
    store.put(HEAD_KEY, head.to_json().unwrap()).await.unwrap();

    let next = sync(
        &store,
        &first,
        SyncOptions {
            base: out.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert!(next.result.identity_reassigned.contains(&"copy.md".to_string()));
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["a.md"].id.as_deref(), Some(DOC_ID));
    assert!(head.files["copy.md"].id.is_some());
    assert_ne!(head.files["copy.md"].id.as_deref(), Some(DOC_ID));
    let copy = String::from_utf8(first.read("copy.md").await.unwrap().unwrap()).unwrap();
    assert!(!copy.contains(DOC_ID));
}

struct CountingStore {
    inner: MemoryStore,
    gets: std::sync::Mutex<Vec<String>>,
}

impl CountingStore {
    fn new() -> Self {
        Self {
            inner: MemoryStore::new(),
            gets: std::sync::Mutex::new(Vec::new()),
        }
    }

    fn block_gets(&self) -> usize {
        self.gets
            .lock()
            .unwrap()
            .iter()
            .filter(|key| key.starts_with("v1/blocks/"))
            .count()
    }

    fn clear(&self) {
        self.gets.lock().unwrap().clear();
    }
}

#[async_trait::async_trait]
impl ObjectStore for CountingStore {
    async fn get(&self, key: &str) -> textus_sync::Result<Option<Vec<u8>>> {
        self.gets.lock().unwrap().push(key.to_string());
        self.inner.get(key).await
    }

    async fn has(&self, key: &str) -> textus_sync::Result<bool> {
        self.inner.has(key).await
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> textus_sync::Result<()> {
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
async fn a_changed_large_file_downloads_only_the_changed_block() {
    let store = CountingStore::new();
    let chunk = textus_sync::protocol::CHUNK_SIZE as usize;
    let mut body = vec![1u8; chunk];
    body.extend(vec![2u8; chunk]);
    body.extend_from_slice(b"tail");
    let a = MemoryLocal::new([("big.mp4".to_string(), body.clone())]);
    let first = sync(&store, &a, options()).await.unwrap();

    let b = MemoryLocal::new([]);
    let joined = sync(&store, &b, options()).await.unwrap();
    assert_eq!(b.read("big.mp4").await.unwrap(), Some(body.clone()));

    body[chunk] = 9;
    a.set("big.mp4", body.clone());
    sync(
        &store,
        &a,
        SyncOptions {
            base: first.base,
            ..options()
        },
    )
    .await
    .unwrap();

    store.clear();
    sync(
        &store,
        &b,
        SyncOptions {
            base: joined.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(b.read("big.mp4").await.unwrap(), Some(body));
    assert_eq!(store.block_gets(), 1);
}
