//! The engine over a real WebDAV server. Not run by default: set
//! `TEXTUS_WEBDAV_URL`, `TEXTUS_WEBDAV_USER` and `TEXTUS_WEBDAV_PASSWORD`
//! to a throwaway server; the run uses its own random prefix.
//!
//!   cargo test -p textus-sync --test webdav_engine_live -- --ignored --nocapture

use std::env;
use textus_sync::protocol::{Manifest, HEAD_KEY};
use textus_sync::{sync, Base, LocalFiles, MemoryLocal, ObjectStore, SyncOptions, WebDavStore};

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

    const ID: &str = "5f1c9a2e-4b7d-4c8a-9e3f-1a2b3c4d5e6f";
    let body = format!("---
textus_id: {ID}
---
hello live").into_bytes();
    let a = MemoryLocal::new([("Notes/a.md".to_string(), body.clone())]);
    let first = sync(&store, &a, options()).await.unwrap();
    assert_eq!(first.result.uploaded, 1);
    let head = Manifest::parse(&store.get(HEAD_KEY).await.unwrap().unwrap()).unwrap();
    assert_eq!(head.files["Notes/a.md"].id.as_deref(), Some(ID));

    let b = MemoryLocal::new([]);
    let second = sync(&store, &b, options()).await.unwrap();
    assert_eq!(second.result.downloaded, 1);
    assert_eq!(b.read("Notes/a.md").await.unwrap(), Some(body));
}
