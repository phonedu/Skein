//! The engine over the in-memory store and folder: first sync, download,
//! conflict, lock, empty scan and deletion.

use chrono::Utc;
use textus_sync::chunk::{describe, hash_hex};
use textus_sync::protocol::{
    block_key, new_revision, Lock, Trashed, HEAD_KEY, HISTORY_KEY, LOCK_KEY,
};
use textus_sync::{
    sync, Base, History, LocalFiles, Manifest, MemoryLocal, MemoryStore, ObjectStore, SyncError,
    SyncOptions,
};

fn local(items: &[(&str, &str)]) -> MemoryLocal {
    MemoryLocal::new(
        items
            .iter()
            .map(|(path, body)| (path.to_string(), body.as_bytes().to_vec())),
    )
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
