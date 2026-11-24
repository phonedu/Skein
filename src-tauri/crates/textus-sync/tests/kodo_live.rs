//! Qiniu Kodo's conditional create and a full sync against a real bucket.
//! Not run by default: set TEXTUS_KODO_ENDPOINT, TEXTUS_KODO_REGION,
//! TEXTUS_KODO_BUCKET, TEXTUS_KODO_ACCESS_KEY and TEXTUS_KODO_SECRET_KEY to
//! a throwaway bucket whose S3 endpoint accepts SigV4.
//!
//!   cargo test -p textus-sync --test kodo_live -- --ignored --nocapture
//!
//! Creates, reads and deletes stay on the S3 endpoint. The lock's create
//! goes through Kodo's native upload service with `insertOnly`, so the
//! probe's second create is what proves the transport is safe here.

use std::env;
use textus_sync::chunk::describe;
use textus_sync::protocol::{block_key, snapshot_key, HEAD_KEY, HISTORY_KEY, LOCK_KEY};
use textus_sync::{probe, sync, Base, LocalFiles, MemoryLocal, ObjectStore, S3Store, SyncOptions};

fn store(prefix: &str) -> S3Store {
    let endpoint = env::var("TEXTUS_KODO_ENDPOINT").expect("TEXTUS_KODO_ENDPOINT");
    let region = env::var("TEXTUS_KODO_REGION").expect("TEXTUS_KODO_REGION");
    let bucket = env::var("TEXTUS_KODO_BUCKET").expect("TEXTUS_KODO_BUCKET");
    let access = env::var("TEXTUS_KODO_ACCESS_KEY").expect("TEXTUS_KODO_ACCESS_KEY");
    let secret = env::var("TEXTUS_KODO_SECRET_KEY").expect("TEXTUS_KODO_SECRET_KEY");
    let path_style =
        env::var("TEXTUS_KODO_PATH_STYLE").unwrap_or_else(|_| "true".to_string()) != "false";
    S3Store::new(
        &endpoint,
        &bucket,
        prefix,
        &region,
        &access,
        &secret,
        path_style,
        textus_sync::s3::S3Flavor::Kodo,
    )
    .unwrap()
}

fn options() -> SyncOptions {
    SyncOptions {
        base: Base::empty(),
        device: "kodo-live".to_string(),
        keep_days: 90,
        keep_chosen: false,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    }
}

/// Best effort: the bucket has no list call here, so remove the protocol
/// files, the snapshots this run published, and the blocks its bodies use.
async fn cleanup(store: &S3Store, revisions: &[String], bodies: &[&[u8]]) {
    for key in [HEAD_KEY, HISTORY_KEY, LOCK_KEY] {
        let _ = store.delete(key).await;
    }
    for revision in revisions {
        let _ = store.delete(&snapshot_key(revision)).await;
    }
    for body in bodies {
        if let Ok(entry) = describe(body) {
            for block in entry.blocks {
                let _ = store.delete(&block_key(&block.hash)).await;
            }
        }
    }
}

#[tokio::test]
#[ignore = "needs a throwaway Qiniu bucket in the environment"]
async fn conditional_create_and_round_trip() {
    let prefix = format!("s3q-create-{}", uuid::Uuid::new_v4());
    let remote = store(&prefix);
    // Create twice: the first write is a native insertOnly upload, the
    // second must be refused (614) rather than overwrite.
    probe(&remote).await.unwrap();

    remote.put("v1/a.txt", b"hello".to_vec()).await.unwrap();
    assert_eq!(
        remote.get("v1/a.txt").await.unwrap(),
        Some(b"hello".to_vec())
    );
    assert!(remote.has("v1/a.txt").await.unwrap());
    assert!(remote
        .create("v1/lock.json", b"one".to_vec())
        .await
        .unwrap());
    assert!(!remote
        .create("v1/lock.json", b"two".to_vec())
        .await
        .unwrap());
    assert_eq!(
        remote.get("v1/lock.json").await.unwrap(),
        Some(b"one".to_vec())
    );
    remote.delete("v1/a.txt").await.unwrap();
    remote.delete("v1/lock.json").await.unwrap();
    assert_eq!(remote.get("v1/lock.json").await.unwrap(), None);
}

#[tokio::test]
#[ignore = "needs a throwaway Qiniu bucket in the environment"]
async fn first_modify_delete_and_conflict() {
    let prefix = format!("s3q-engine-{}", uuid::Uuid::new_v4());
    let remote = store(&prefix);
    probe(&remote).await.unwrap();
    let mut revisions = Vec::new();

    // First sync: a new document goes up.
    let a = MemoryLocal::new([("Notes/a.md".to_string(), b"one".to_vec())]);
    let first = sync(&remote, &a, options()).await.unwrap();
    assert_eq!(first.result.uploaded, 1);
    revisions.push(first.result.revision.clone());

    // A second device joins and gets the file.
    let b = MemoryLocal::new([]);
    let joined = sync(&remote, &b, options()).await.unwrap();
    assert!(b.has("Notes/a.md"));
    revisions.push(joined.result.revision.clone());

    // An edit on the first device lands, then the second's edit conflicts.
    a.set("Notes/a.md", b"two".to_vec());
    let edited = sync(
        &remote,
        &a,
        SyncOptions {
            base: first.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(edited.result.uploaded, 1);
    revisions.push(edited.result.revision.clone());

    b.set("Notes/a.md", b"three".to_vec());
    let conflict = sync(
        &remote,
        &b,
        SyncOptions {
            base: joined.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(conflict.result.conflicts.len(), 1);
    let conflict_path = conflict.result.conflicts[0].clone();
    assert!(b.has(&conflict_path));
    assert_eq!(b.read("Notes/a.md").await.unwrap(), Some(b"three".to_vec()));
    revisions.push(conflict.result.revision.clone());

    // A deletion on the second device removes the path remotely…
    b.delete("Notes/a.md");
    let removed = sync(
        &remote,
        &b,
        SyncOptions {
            base: conflict.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert!(removed.result.removed >= 1);
    revisions.push(removed.result.revision.clone());

    // …and the first device follows it, keeping the conflict copy.
    let settled = sync(
        &remote,
        &a,
        SyncOptions {
            base: edited.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert!(!a.has("Notes/a.md"));
    assert!(a.has(&conflict_path));
    revisions.push(settled.result.revision.clone());

    cleanup(&remote, &revisions, &[b"one", b"two", b"three"]).await;
}
