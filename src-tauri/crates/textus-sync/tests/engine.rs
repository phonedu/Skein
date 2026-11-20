//! The engine over the in-memory store and folder: first sync, download,
//! conflict, lock, empty scan and deletion.

use textus_sync::chunk::{describe, hash_hex};
use textus_sync::protocol::{block_key, new_revision, Lock, HEAD_KEY, HISTORY_KEY, LOCK_KEY};
use textus_sync::{
    sync, Base, History, LocalFiles, Manifest, MemoryLocal, MemoryStore, ObjectStore, SyncOptions,
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
