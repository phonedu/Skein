//! The Hub through its real clients: WebDavStore, the sync engine and the
//! pairing endpoint. Every test uses loopback and a throwaway repository.

use std::path::PathBuf;
use textus_hub::{Hub, HubConfig, StartedHub};
use textus_sync::{sync, Base, LocalFiles, MemoryLocal, ObjectStore, SyncOptions, WebDavStore};

struct Fixture {
    root: PathBuf,
    started: StartedHub,
}

impl Fixture {
    async fn start(read_only_new_devices: bool) -> Self {
        let root =
            std::env::temp_dir().join(format!("textus-hub-test-{}", uuid::Uuid::new_v4().simple()));
        let started = Hub::start(HubConfig {
            root: root.clone(),
            bind: "127.0.0.1".parse().unwrap(),
            port: 0,
            read_only_new_devices,
            local_token: None,
        })
        .await
        .unwrap();
        Self { root, started }
    }

    fn local_token(&self) -> String {
        self.started
            .local
            .token
            .clone()
            .expect("a first start makes a local token")
    }

    fn store(&self) -> WebDavStore {
        WebDavStore::new(
            &self.started.hub.status().base_url,
            "",
            &self.started.local.device_id,
            &self.local_token(),
        )
        .unwrap()
    }

    async fn pair(&self, name: &str) -> (textus_hub::DeviceInfo, String) {
        let address = self.started.hub.status().address;
        let code = self
            .started
            .hub
            .status()
            .pairing
            .expect("a new Hub has a pairing code")
            .code;
        let response = reqwest::Client::new()
            .post(format!("{address}/pair"))
            .json(&serde_json::json!({ "code": code, "device": name }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body: serde_json::Value = response.json().await.unwrap();
        let device = textus_hub::DeviceInfo {
            id: body["username"].as_str().unwrap().to_string(),
            name: name.to_string(),
            read_only: body["readOnly"].as_bool().unwrap(),
            paired_at: String::new(),
        };
        (device, body["token"].as_str().unwrap().to_string())
    }

    async fn finish(self) {
        self.started.hub.shutdown().await;
        let _ = std::fs::remove_dir_all(self.root);
    }
}

#[tokio::test]
async fn the_webdav_client_probes_and_round_trips_objects() {
    let fixture = Fixture::start(false).await;
    let store = fixture.store();
    store.probe().await.unwrap();
    assert!(store.create("v1/probes/a", b"one".to_vec()).await.unwrap());
    assert!(!store.create("v1/probes/a", b"two".to_vec()).await.unwrap());
    assert_eq!(store.get("v1/probes/a").await.unwrap().unwrap(), b"one");
    store.put("v1/probes/a", b"three".to_vec()).await.unwrap();
    assert_eq!(store.get("v1/probes/a").await.unwrap().unwrap(), b"three");
    store.delete("v1/probes/a").await.unwrap();
    assert!(!store.has("v1/probes/a").await.unwrap());
    fixture.finish().await;
}

#[tokio::test]
async fn a_paired_device_syncs_and_a_second_code_is_refused() {
    let fixture = Fixture::start(false).await;
    let (device, token) = fixture.pair("phone").await;
    let address = fixture.started.hub.status().address;
    let code = fixture.started.hub.status().pairing;
    assert!(code.is_none(), "pairing consumes the code");

    let phone = WebDavStore::new(
        &format!("{address}/hub/{}", fixture.started.hub.status().repo_id),
        "",
        &device.id,
        &token,
    )
    .unwrap();
    phone.probe().await.unwrap();
    phone
        .put("v1/head.json", b"from phone".to_vec())
        .await
        .unwrap();
    assert_eq!(
        fixture.store().get("v1/head.json").await.unwrap().unwrap(),
        b"from phone"
    );
    fixture.finish().await;
}

#[tokio::test]
async fn a_read_only_device_can_read_but_not_write() {
    let fixture = Fixture::start(true).await;
    fixture
        .store()
        .put("v1/head.json", b"text".to_vec())
        .await
        .unwrap();
    let (device, token) = fixture.pair("reader").await;
    assert!(device.read_only);
    let address = fixture.started.hub.status().address;
    let reader = WebDavStore::new(
        &format!("{address}/hub/{}", fixture.started.hub.status().repo_id),
        "",
        &device.id,
        &token,
    )
    .unwrap();
    assert_eq!(reader.get("v1/head.json").await.unwrap().unwrap(), b"text");
    assert_eq!(
        reader
            .put("v1/head.json", b"changed".to_vec())
            .await
            .unwrap_err()
            .code,
        "permissionError"
    );
    fixture.finish().await;
}

#[tokio::test]
async fn revoking_a_device_stops_its_token() {
    let fixture = Fixture::start(false).await;
    let (device, token) = fixture.pair("phone").await;
    assert!(fixture.started.hub.revoke(&device.id).unwrap());
    let address = fixture.started.hub.status().address;
    let phone = WebDavStore::new(
        &format!("{address}/hub/{}", fixture.started.hub.status().repo_id),
        "",
        &device.id,
        &token,
    )
    .unwrap();
    assert_eq!(
        phone.get("v1/head.json").await.unwrap_err().code,
        "permissionError"
    );
    fixture.finish().await;
}

#[tokio::test]
async fn the_engine_syncs_two_folders_through_the_hub() {
    let fixture = Fixture::start(false).await;
    let store = fixture.store();
    let desktop = MemoryLocal::new(vec![(
        "Notes/a.md".to_string(),
        b"hello from the desktop".to_vec(),
    )]);
    let options = || SyncOptions {
        base: Base::empty(),
        device: "desktop".to_string(),
        keep_days: 90,
        keep_chosen: false,
        allow_empty_scan: false,
        allow_bulk_delete: false,
    };
    let first = sync(&store, &desktop, options()).await.unwrap();
    assert_eq!(first.result.uploaded, 1);

    let phone = MemoryLocal::new(Vec::new());
    let second = sync(&store, &phone, options()).await.unwrap();
    assert_eq!(second.result.downloaded, 1);
    assert_eq!(
        phone.read("Notes/a.md").await.unwrap().unwrap(),
        b"hello from the desktop"
    );

    phone.set("Notes/a.md", b"edited on the phone".to_vec());
    sync(
        &store,
        &phone,
        SyncOptions {
            base: second.base,
            ..options()
        },
    )
    .await
    .unwrap();
    let third = sync(
        &store,
        &desktop,
        SyncOptions {
            base: first.base,
            ..options()
        },
    )
    .await
    .unwrap();
    assert_eq!(third.result.downloaded, 1);
    assert_eq!(
        desktop.read("Notes/a.md").await.unwrap().unwrap(),
        b"edited on the phone"
    );
    fixture.finish().await;
}

#[tokio::test]
async fn a_dot_dot_in_an_encoded_segment_is_not_a_path() {
    let fixture = Fixture::start(false).await;
    let status = fixture.started.hub.status();
    let url = format!(
        "{}/hub/{}/%2e%2e/%2e%2e/devices.json",
        status.address, status.repo_id
    );
    let response = reqwest::Client::new()
        .get(&url)
        .basic_auth(
            &fixture.started.local.device_id,
            Some(fixture.local_token()),
        )
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    fixture.finish().await;
}

#[tokio::test]
async fn a_restart_keeps_the_repository_and_the_local_token() {
    let fixture = Fixture::start(false).await;
    let status = fixture.started.hub.status();
    let token = fixture.local_token();
    fixture
        .store()
        .put("v1/head.json", b"kept".to_vec())
        .await
        .unwrap();
    fixture.started.hub.shutdown().await;

    let restarted = Hub::start(HubConfig {
        root: fixture.root.clone(),
        bind: "127.0.0.1".parse().unwrap(),
        port: 0,
        read_only_new_devices: false,
        local_token: Some(token.clone()),
    })
    .await
    .unwrap();
    assert_eq!(restarted.hub.status().repo_id, status.repo_id);
    assert!(restarted.local.token.is_none(), "the old token is kept");
    let store = WebDavStore::new(&restarted.hub.status().base_url, "", "local", &token).unwrap();
    assert_eq!(store.get("v1/head.json").await.unwrap().unwrap(), b"kept");
    restarted.hub.shutdown().await;
    let _ = std::fs::remove_dir_all(&fixture.root);
}

#[tokio::test]
async fn stopping_closes_kept_alive_connections_and_releases_the_port() {
    let fixture = Fixture::start(false).await;
    let status = fixture.started.hub.status();
    let store = fixture.store();
    store.put("v1/head.json", b"before".to_vec()).await.unwrap();
    fixture.started.hub.shutdown().await;
    assert_eq!(
        store.get("v1/head.json").await.unwrap_err().code,
        "networkError"
    );
    let rebound = tokio::net::TcpListener::bind(("127.0.0.1", status.port))
        .await
        .expect("the Hub still holds its port");
    drop(rebound);
    let _ = std::fs::remove_dir_all(&fixture.root);
}
