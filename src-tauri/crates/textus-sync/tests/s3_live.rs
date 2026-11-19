//! The S3 transport and engine against a real bucket. Not run by default:
//! set TEXTUS_S3_ENDPOINT, TEXTUS_S3_REGION, TEXTUS_S3_BUCKET,
//! TEXTUS_S3_ACCESS_KEY and TEXTUS_S3_SECRET_KEY to a throwaway bucket.
//!
//!   cargo test -p textus-sync --test s3_live -- --ignored --nocapture

use std::env;
use textus_sync::{probe, sync, Base, LocalFiles, MemoryLocal, ObjectStore, S3Store, SyncOptions};

fn store(prefix: &str) -> S3Store {
    let endpoint = env::var("TEXTUS_S3_ENDPOINT").expect("TEXTUS_S3_ENDPOINT");
    let region = env::var("TEXTUS_S3_REGION").expect("TEXTUS_S3_REGION");
    let bucket = env::var("TEXTUS_S3_BUCKET").expect("TEXTUS_S3_BUCKET");
    let access = env::var("TEXTUS_S3_ACCESS_KEY").expect("TEXTUS_S3_ACCESS_KEY");
    let secret = env::var("TEXTUS_S3_SECRET_KEY").expect("TEXTUS_S3_SECRET_KEY");
    let path_style =
        env::var("TEXTUS_S3_PATH_STYLE").unwrap_or_else(|_| "true".to_string()) != "false";
    S3Store::new(
        &endpoint, &bucket, prefix, &region, &access, &secret, path_style,
    )
    .unwrap()
}

#[tokio::test]
#[ignore = "needs a throwaway S3 bucket in the environment"]
async fn conditional_create_and_round_trip() {
    let prefix = format!("rust-s3-{}", uuid::Uuid::new_v4());
    let remote = store(&prefix);
    probe(&remote).await.unwrap();

    remote.put("v1/a.txt", b"hello".to_vec()).await.unwrap();
    assert_eq!(
        remote.get("v1/a.txt").await.unwrap(),
        Some(b"hello".to_vec())
    );
    assert!(remote
        .create("v1/lock.json", b"one".to_vec())
        .await
        .unwrap());
    assert!(!remote
        .create("v1/lock.json", b"two".to_vec())
        .await
        .unwrap());
    remote.delete("v1/a.txt").await.unwrap();
    remote.delete("v1/lock.json").await.unwrap();

    let options = || SyncOptions {
        base: Base::empty(),
        device: "rust-s3-live".to_string(),
        keep_days: 90,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    };
    let a = MemoryLocal::new([("Notes/a.md".to_string(), b"live body".to_vec())]);
    let first = sync(&remote, &a, options()).await.unwrap();
    assert_eq!(first.result.uploaded, 1);
    let b = MemoryLocal::new([]);
    let second = sync(&remote, &b, options()).await.unwrap();
    assert_eq!(second.result.downloaded, 1);
    assert_eq!(
        b.read("Notes/a.md").await.unwrap(),
        Some(b"live body".to_vec())
    );
}
