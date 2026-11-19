//! A real WebDAV round trip. Not run by default: point it at a throwaway
//! server with `TEXTUS_WEBDAV_URL`, `TEXTUS_WEBDAV_USER` and
//! `TEXTUS_WEBDAV_PASSWORD` in the environment; nothing is kept in the repo.
//!
//!   cargo test -p textus-sync --test webdav_live -- --ignored --nocapture

use std::env;
use textus_sync::{probe, ObjectStore, WebDavStore};

#[tokio::test]
#[ignore = "needs a throwaway WebDAV server in TEXTUS_WEBDAV_URL"]
async fn webdav_round_trip_and_atomic_create() {
    let endpoint = env::var("TEXTUS_WEBDAV_URL").expect("TEXTUS_WEBDAV_URL");
    let user = env::var("TEXTUS_WEBDAV_USER").expect("TEXTUS_WEBDAV_USER");
    let password = env::var("TEXTUS_WEBDAV_PASSWORD").expect("TEXTUS_WEBDAV_PASSWORD");
    let store = WebDavStore::new(&endpoint, "rust-s2", &user, &password).unwrap();

    probe(&store).await.unwrap();

    let body = b"hello from Rust".to_vec();
    store.put("v1/a.txt", body.clone()).await.unwrap();
    assert_eq!(store.get("v1/a.txt").await.unwrap(), Some(body));
    assert!(store.has("v1/a.txt").await.unwrap());

    assert!(store.create("v1/lock.json", b"one".to_vec()).await.unwrap());
    assert!(!store.create("v1/lock.json", b"two".to_vec()).await.unwrap());
    assert_eq!(
        store.get("v1/lock.json").await.unwrap(),
        Some(b"one".to_vec())
    );

    store.delete("v1/lock.json").await.unwrap();
    store.delete("v1/a.txt").await.unwrap();
    assert!(!store.has("v1/lock.json").await.unwrap());
}
