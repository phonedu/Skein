//! One built-in sync run, for the settings page and the first built-app
//! checks. The request is JSON so the command stays one primitive: the
//! connection fields are not part of the generated bindings, and no
//! credential is logged.

use crate::sync::local::{LocalSync, TrashFile};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use textus_sync::{probe, sync, Base, ObjectStore, S3Store, SyncOptions, SyncResult, WebDavStore};

#[derive(Deserialize)]
struct Request {
    root: String,
    provider: String,
    #[serde(default)]
    endpoint: String,
    #[serde(default)]
    bucket: String,
    #[serde(default)]
    prefix: String,
    #[serde(default)]
    region: String,
    #[serde(default)]
    path_style: bool,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    access_key: String,
    #[serde(default)]
    secret_key: String,
    #[serde(default)]
    base: Option<String>,
    #[serde(default)]
    device: String,
    #[serde(default = "default_keep")]
    keep_days: u32,
    #[serde(default)]
    allow_empty_scan: bool,
    #[serde(default)]
    allow_bulk_delete: bool,
}

fn default_keep() -> u32 {
    90
}

#[derive(Serialize)]
struct Reply {
    result: SyncResult,
    base: Base,
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_run(app: tauri::AppHandle, request: String) -> Result<String, String> {
    let request: Request =
        serde_json::from_str(&request).map_err(|_| "invalidConfig".to_string())?;
    let root = PathBuf::from(&request.root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err(crate::errors::error("notFolder"));
    }
    let store: Box<dyn ObjectStore> = match request.provider.as_str() {
        "webdav" => Box::new(
            WebDavStore::new(
                &request.endpoint,
                &request.prefix,
                &request.username,
                &request.password,
            )
            .map_err(|e| e.to_string())?,
        ),
        "s3" => Box::new(
            S3Store::new(
                &request.endpoint,
                &request.bucket,
                &request.prefix,
                &request.region,
                &request.access_key,
                &request.secret_key,
                request.path_style,
            )
            .map_err(|e| e.to_string())?,
        ),
        _ => return Err(crate::errors::error("invalidConfig")),
    };
    probe(store.as_ref()).await.map_err(|e| e.to_string())?;

    #[cfg(desktop)]
    let trash: TrashFile = {
        let _ = &app;
        let shown = root.clone();
        Arc::new(move |path| crate::atomic::user_file_to_trash(path, Some(&shown)))
    };
    #[cfg(mobile)]
    let trash: TrashFile = {
        let app = app.clone();
        let shown = root.clone();
        Arc::new(move |path| crate::trash::to_app_trash(&app, path, &shown))
    };

    let local = LocalSync::new(root, trash).map_err(|e| e.to_string())?;
    let base = match request.base {
        Some(raw) => Base::parse(raw.as_bytes()).map_err(|e| e.to_string())?,
        None => Base::empty(),
    };
    let outcome = sync(
        store.as_ref(),
        &local,
        SyncOptions {
            base,
            device: if request.device.is_empty() {
                "this device".to_string()
            } else {
                request.device
            },
            keep_days: request.keep_days,
            allow_empty_scan: request.allow_empty_scan,
            allow_bulk_delete: request.allow_bulk_delete,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_string(&Reply {
        result: outcome.result,
        base: outcome.base,
    })
    .map_err(|e| e.to_string())
}
