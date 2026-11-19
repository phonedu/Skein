//! The built-in sync's commands. Settings stores the connection per folder;
//! a run reads that connection, the owner-only secrets and the local base,
//! then publishes the result. Request fields are JSON so the generated
//! bindings stay small and no credential is logged.

use crate::sync::local::{LocalSync, TrashFile};
use crate::sync::store::{self, Config, Credentials, LastRun};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use textus_sync::path::conflict_path;
use textus_sync::protocol::HISTORY_KEY;
use textus_sync::{
    probe, read_entry, sync, Base, History, LocalFiles, ObjectStore, S3Store, SyncOptions,
    SyncResult, WebDavStore,
};

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

fn store_for(config: &Config, credentials: &Credentials) -> Result<Box<dyn ObjectStore>, String> {
    match config.provider.as_str() {
        "webdav" => Ok(Box::new(
            WebDavStore::new(
                &config.endpoint,
                &config.prefix,
                &credentials.username,
                &credentials.password,
            )
            .map_err(|e| e.to_string())?,
        )),
        "s3" => Ok(Box::new(
            S3Store::new(
                &config.endpoint,
                &config.bucket,
                &config.prefix,
                &config.region,
                &credentials.access_key,
                &credentials.secret_key,
                config.path_style,
            )
            .map_err(|e| e.to_string())?,
        )),
        _ => Err(crate::errors::error("invalidConfig")),
    }
}

fn trash_for(app: &tauri::AppHandle, root: &std::path::Path) -> TrashFile {
    #[cfg(desktop)]
    {
        let _ = app;
        let shown = root.to_path_buf();
        Arc::new(move |path| crate::atomic::user_file_to_trash(path, Some(&shown)))
    }
    #[cfg(mobile)]
    {
        let app = app.clone();
        let shown = root.to_path_buf();
        Arc::new(move |path| crate::trash::to_app_trash(&app, path, &shown))
    }
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "this device".to_string())
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// A one-off run with the connection in the request; used by built-app
/// checks and the first migration path. Settings uses the saved commands.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_run(app: tauri::AppHandle, request: String) -> Result<String, String> {
    let request: Request =
        serde_json::from_str(&request).map_err(|_| "invalidConfig".to_string())?;
    let root = store::canonical_root(&request.root)?;
    let config = Config {
        provider: request.provider,
        endpoint: request.endpoint,
        bucket: request.bucket,
        prefix: request.prefix,
        region: request.region,
        path_style: request.path_style,
        keep_days: request.keep_days,
    };
    let credentials = Credentials {
        username: request.username,
        password: request.password,
        access_key: request.access_key,
        secret_key: request.secret_key,
    };
    let store = store_for(&config, &credentials)?;
    probe(store.as_ref()).await.map_err(|e| e.to_string())?;
    let trash = trash_for(&app, &root);
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
                device_name()
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

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_settings_get(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Ok(serde_json::json!({ "configured": false }).to_string());
    };
    let mut value = store::settings_json(
        &config,
        !credentials.username.is_empty() || !credentials.access_key.is_empty(),
    );
    value["configured"] = serde_json::Value::Bool(true);
    Ok(value.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_settings_save(
    app: tauri::AppHandle,
    root: String,
    config: String,
    credentials: String,
) -> Result<(), String> {
    let root = store::canonical_root(&root)?;
    let config: Config =
        serde_json::from_str(&config).map_err(|_| crate::errors::error("invalidConfig"))?;
    let credentials: Credentials =
        serde_json::from_str(&credentials).map_err(|_| crate::errors::error("invalidConfig"))?;
    store::save(&app, &root, config, credentials)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_settings_forget(app: tauri::AppHandle, root: String) -> Result<(), String> {
    let root = store::canonical_root(&root)?;
    store::forget(&app, &root)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_status(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let configured = store::load(&app, &root)?.is_some();
    let last = store::load_last(&app, &root)?;
    Ok(serde_json::json!({ "configured": configured, "last": last }).to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_run_saved(
    app: tauri::AppHandle,
    root: String,
    allow_empty_scan: bool,
    allow_bulk_delete: bool,
) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let run = async {
        let store = store_for(&config, &credentials)?;
        probe(store.as_ref()).await.map_err(|e| e.to_string())?;
        let base = store::load_base(&app, &root)?;
        let local =
            LocalSync::new(root.clone(), trash_for(&app, &root)).map_err(|e| e.to_string())?;
        let outcome = sync(
            store.as_ref(),
            &local,
            SyncOptions {
                base,
                device: device_name(),
                keep_days: config.keep_days,
                allow_empty_scan,
                allow_bulk_delete,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        store::save_base(&app, &root, &outcome.base)?;
        Ok::<_, String>(outcome)
    }
    .await;
    match run {
        Ok(outcome) => {
            let at = now();
            store::save_last(
                &app,
                &root,
                &LastRun {
                    at,
                    result: Some(outcome.result.clone()),
                    error: None,
                },
            )?;
            serde_json::to_string(&Reply {
                result: outcome.result,
                base: outcome.base,
            })
            .map_err(|e| e.to_string())
        }
        Err(error) => {
            let _ = store::save_last(
                &app,
                &root,
                &LastRun {
                    at: now(),
                    result: None,
                    error: Some(error.clone()),
                },
            );
            Err(error)
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Conflict {
    path: String,
    name: String,
    size: u64,
    modified_ms: Option<u64>,
}

fn walk_conflicts(dir: &Path, root: &Path, out: &mut Vec<Conflict>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            walk_conflicts(&path, root, out);
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        out.push(Conflict {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: relative,
            size: metadata.len(),
            modified_ms: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64),
        });
    }
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_conflicts(root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let mut conflicts = Vec::new();
    walk_conflicts(&root.join("Sync conflicts"), &root, &mut conflicts);
    conflicts.sort_by(|a, b| a.path.cmp(&b.path));
    serde_json::to_string(&conflicts).map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_history(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let store = store_for(&config, &credentials)?;
    let Some(raw) = store.get(HISTORY_KEY).await.map_err(|e| e.to_string())? else {
        return Ok("null".to_string());
    };
    let history = History::parse(&raw).map_err(|e| e.to_string())?;
    serde_json::to_string(&history).map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_restore(
    app: tauri::AppHandle,
    root: String,
    path: String,
    hash: String,
) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let store = store_for(&config, &credentials)?;
    let raw = store
        .get(HISTORY_KEY)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| crate::errors::error("notFound"))?;
    let history = History::parse(&raw).map_err(|e| e.to_string())?;
    let version = history
        .versions
        .get(&path)
        .and_then(|versions| versions.iter().find(|version| version.entry.hash == hash))
        .ok_or_else(|| crate::errors::error("notFound"))?;
    let bytes = read_entry(store.as_ref(), &version.entry)
        .await
        .map_err(|e| e.to_string())?;
    let local = LocalSync::new(root.clone(), trash_for(&app, &root)).map_err(|e| e.to_string())?;
    let target = match local.read(&path).await.map_err(|e| e.to_string())? {
        Some(existing) if textus_sync::chunk::hash_hex(&existing) == hash => path.clone(),
        Some(_) => conflict_path(&path, &hash),
        None => path.clone(),
    };
    if !local
        .apply(&target, bytes)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err(crate::errors::error("fileOpen"));
    }
    Ok(serde_json::json!({ "path": target }).to_string())
}
