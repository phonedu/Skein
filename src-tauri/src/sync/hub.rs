//! The desktop's LAN Hub: start and stop the embedded WebDAV service, its
//! pairing code and devices, and the explicit binding of this vault. The
//! server itself lives in `textus-hub`; this file is the app's state and
//! commands around it.

use crate::app_dirs::AppDirs;
use crate::sync::store::{self, Config, Credentials};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use textus_hub::{Hub, HubConfig, HubStatus, DEFAULT_PORT};
use textus_sync::chunk::hash_hex;
use tokio::sync::Mutex;

struct Running {
    hub: Hub,
    connection_id: String,
    /// mDNS and UDP discovery, when the network allowed either.
    _discovery: Option<textus_discovery::Advertiser>,
}

/// One Hub per app process. The Mutex is held across start so two clicks
/// cannot bind the same port.
#[derive(Default)]
pub struct HubState(Mutex<Option<Running>>);

impl HubState {
    pub fn new() -> Self {
        Self::default()
    }
}

fn hub_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .own_data_dir()
        .map_err(|error| error.to_string())?
        .join("hub");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn connection_id_for(repo_id: &str, root: &Path) -> String {
    format!(
        "hub-{repo_id}-{}",
        hash_hex(root.to_string_lossy().as_bytes())
    )
}

fn host_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Textus desktop".to_string())
}

fn base_config(connection_id: &str, endpoint: &str) -> Config {
    Config {
        connection_id: connection_id.to_string(),
        provider: "webdav".to_string(),
        endpoint: endpoint.to_string(),
        bucket: String::new(),
        prefix: String::new(),
        region: String::new(),
        path_style: false,
        s3_flavor: "standard".to_string(),
        keep_days: 90,
        keep_chosen: false,
        encrypted: false,
        vault_id: String::new(),
    }
}

fn empty_credentials(username: &str, password: &str) -> Credentials {
    Credentials {
        username: username.to_string(),
        password: password.to_string(),
        access_key: String::new(),
        secret_key: String::new(),
        sync_password: String::new(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartReply {
    #[serde(flatten)]
    status: HubStatus,
    local_connection_id: String,
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_start(
    app: AppHandle,
    root: String,
    read_only: bool,
    port: Option<u16>,
    bind: Option<String>,
) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let hub_root = hub_root(&app)?;
    let state = app.state::<HubState>();
    let mut running = state.0.lock().await;
    if running.is_some() {
        return Err(crate::errors::error("alreadyRunning"));
    }
    let addresses = textus_hub::lan_addresses();
    let bind = match bind
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(address) => address
            .parse()
            .map_err(|_| crate::errors::error("invalidConfig"))?,
        None => addresses
            .first()
            .ok_or_else(|| crate::errors::error("noLanAddress"))?
            .parse()
            .map_err(|_| crate::errors::error("noLanAddress"))?,
    };
    let repo_id = textus_hub::repository_id(&hub_root);
    let connection_id = repo_id
        .as_deref()
        .map(|repo_id| connection_id_for(repo_id, &root))
        .unwrap_or_default();
    let token = if connection_id.is_empty() {
        None
    } else {
        store::connection_credentials(&app, &connection_id)?
            .map(|credentials| credentials.password)
            .filter(|password| !password.is_empty())
    };
    let started = Hub::start(HubConfig {
        root: hub_root,
        bind,
        port: port.unwrap_or(DEFAULT_PORT),
        read_only_new_devices: read_only,
        local_token: token,
    })
    .await
    .map_err(|error| error.to_string())?;
    let status = started.hub.status();
    let connection_id = connection_id_for(&status.repo_id, &root);
    if let Err(error) = store::save_connection(
        &app,
        &connection_id,
        &base_config(&connection_id, &status.base_url),
        &empty_credentials(
            &started.local.device_id,
            started.local.token.as_deref().unwrap_or_default(),
        ),
    ) {
        started.hub.shutdown().await;
        return Err(error);
    }
    let discovery =
        textus_discovery::Advertiser::start(bind, status.port, &host_name(), &status.repo_id).ok();
    let reply = StartReply {
        status,
        local_connection_id: connection_id.clone(),
    };
    *running = Some(Running {
        hub: started.hub,
        connection_id,
        _discovery: discovery,
    });
    serde_json::to_string(&reply).map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_stop(app: AppHandle) -> Result<(), String> {
    let state = app.state::<HubState>();
    let running = state.0.lock().await.take();
    if let Some(running) = running {
        running.hub.shutdown().await;
    }
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_status(app: AppHandle) -> Result<String, String> {
    let state = app.state::<HubState>();
    let running = state.0.lock().await;
    let Some(running) = running.as_ref() else {
        return Ok(serde_json::json!({
            "running": false,
            "lanAddresses": textus_hub::lan_addresses(),
        })
        .to_string());
    };
    let status = running.hub.status();
    serde_json::to_string(&serde_json::json!({
        "running": true,
        "localConnectionId": running.connection_id,
        "status": status,
    }))
    .map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_code(app: AppHandle, read_only: bool) -> Result<String, String> {
    let state = app.state::<HubState>();
    let running = state.0.lock().await;
    let Some(running) = running.as_ref() else {
        return Err(crate::errors::error("notFound"));
    };
    let pairing = running
        .hub
        .new_code(read_only)
        .map_err(|error| error.to_string())?;
    serde_json::to_string(&pairing).map_err(|error| error.to_string())
}

/// The QR a phone scans: address, one-time code and repository, encoded by
/// the desktop. The code is the same one shown beside it.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_pairing_qr(app: AppHandle) -> Result<String, String> {
    let state = app.state::<HubState>();
    let running = state.0.lock().await;
    let Some(running) = running.as_ref() else {
        return Err(crate::errors::error("notFound"));
    };
    let status = running.hub.status();
    let pairing = status
        .pairing
        .ok_or_else(|| crate::errors::error("expired"))?;
    let payload = textus_discovery::PairPayload {
        address: status.address,
        code: pairing.code,
        repo_id: status.repo_id,
    };
    running
        .hub
        .pairing_svg(&payload.encode())
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_revoke(app: AppHandle, device_id: String) -> Result<bool, String> {
    let state = app.state::<HubState>();
    let running = state.0.lock().await;
    let Some(running) = running.as_ref() else {
        return Err(crate::errors::error("notFound"));
    };
    running
        .hub
        .revoke(&device_id)
        .map_err(|error| error.to_string())
}

/// Binds this vault to the running Hub at the repository root. Separate from
/// starting, so starting a Hub never silently replaces an existing cloud
/// connection.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_bind(app: AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let state = app.state::<HubState>();
    let running = state.0.lock().await;
    let Some(running) = running.as_ref() else {
        return Err(crate::errors::error("notFound"));
    };
    store::bind_connection(&app, &root, &running.connection_id)?;
    serde_json::to_string(&serde_json::json!({
        "connectionId": running.connection_id,
        "baseUrl": running.hub.status().base_url,
    }))
    .map_err(|error| error.to_string())
}

/// Stops the Hub and removes its repository and paired devices. This is the
/// settings page's explicit danger action; the vault itself is untouched.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_clear(app: AppHandle) -> Result<(), String> {
    let state = app.state::<HubState>();
    let mut running = state.0.lock().await;
    if let Some(active) = running.take() {
        active.hub.shutdown().await;
    }
    let root = hub_root(&app)?;
    std::fs::remove_dir_all(&root).map_err(|error| error.to_string())
}
