//! The engine over a real WebDAV server. Not run by default: set
//! `TEXTUS_WEBDAV_URL`, `TEXTUS_WEBDAV_USER` and `TEXTUS_WEBDAV_PASSWORD`
//! to a throwaway server; the run uses its own random prefix.
//!
//!   cargo test -p textus-sync --test webdav_engine_live -- --ignored --nocapture

use std::env;
use textus_sync::{sync, Base, LocalFiles, MemoryLocal, SyncOptions, WebDavStore};

#[tokio::test]
#[ignore = "needs a throwaway WebDAV server in the environment"]
async fn one_device_uploads_and_another_downloads() {
    let endpoint = env::var("TEXTUS_WEBDAV_URL").expect("TEXTUS_WEBDAV_URL");
    let user = env::var("TEXTUS_WEBDAV_USER").expect("TEXTUS_WEBDAV_USER");
    let password = env::var("TEXTUS_WEBDAV_PASSWORD").expect("TEXTUS_WEBDAV_PASSWORD");
    let prefix = format!("rust-engine-{}", uuid::Uuid::new_v4());
    let store = WebDavStore::new(&endpoint, &prefix, &user, &password).unwrap();
    let options = || SyncOptions {
        base: Base::empty(),
        device: "rust-live".to_string(),
        keep_days: 90,
        keep_chosen: false,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    };

    let a = MemoryLocal::new([("Notes/a.md".to_string(), b"hello live".to_vec())]);
    let first = sync(&store, &a, options()).await.unwrap();
    assert_eq!(first.result.uploaded, 1);

    let b = MemoryLocal::new([]);
    let second = sync(&store, &b, options()).await.unwrap();
    assert_eq!(second.result.downloaded, 1);
    assert_eq!(
        b.read("Notes/a.md").await.unwrap(),
        Some(b"hello live".to_vec())
    );
}
