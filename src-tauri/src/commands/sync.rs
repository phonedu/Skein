//! The built-in sync's commands. Settings stores the connection per folder;
//! a run reads that connection, the owner-only secrets and the local base,
//! then publishes the result. Request fields are JSON so the generated
//! bindings stay small and no credential is logged.

use crate::sync::local::{LocalSync, TrashFile};
use crate::sync::store::{self, Config, Credentials, LastRun};
use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use textus_sync::path::conflict_path;
use textus_sync::protocol::{HEAD_KEY, HISTORY_KEY, LOCK_KEY};
use textus_sync::{
    probe, read_entry, sync, Base, History, LocalFiles, Lock, ObjectStore, S3Store, SyncOptions,
    SyncResult, WebDavStore,
};

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
                if config.s3_flavor == "oss" {
                    textus_sync::s3::S3Flavor::Oss
                } else {
                    textus_sync::s3::S3Flavor::Standard
                },
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

/// The open documents' canonical paths, consulted before a write, removal
/// or rename. A tab's path is absolute; canonicalizing both sides keeps
/// separators and case from hiding a match.
fn open_documents(paths: &[String]) -> Arc<dyn Fn(&Path) -> bool + Send + Sync> {
    let open: std::collections::HashSet<std::path::PathBuf> = paths
        .iter()
        .filter_map(|path| std::path::PathBuf::from(path).canonicalize().ok())
        .collect();
    Arc::new(move |target: &Path| {
        target
            .canonicalize()
            .map(|target| open.contains(&target))
            .unwrap_or(false)
    })
}

/// The same shape the engine's conflict suffixes use, for a restore target
/// that already exists with other bytes.
fn suffixed(path: &str) -> String {
    let dot = path.rfind('.');
    let slash = path.rfind('/');
    let at = match dot {
        Some(dot) if Some(dot) > slash.map(|slash| slash + 1) => dot,
        _ => path.len(),
    };
    format!(
        "{}-{}{}",
        &path[..at],
        uuid::Uuid::new_v4().simple(),
        &path[at..]
    )
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_settings_get(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let connections = store::connection_list(&app, &root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Ok(serde_json::json!({
            "configured": false,
            "connections": connections,
        })
        .to_string());
    };
    let mut value =
        store::settings_json(&config, credentials.has_for(&config.provider), &connections);
    value["configured"] = serde_json::Value::Bool(true);
    Ok(value.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_connection_update(
    app: tauri::AppHandle,
    connection_id: String,
    config: String,
    credentials: String,
    default_prefix: Option<String>,
) -> Result<String, String> {
    let config: Config =
        serde_json::from_str(&config).map_err(|_| crate::errors::error("invalidConfig"))?;
    let credentials: Credentials =
        serde_json::from_str(&credentials).map_err(|_| crate::errors::error("invalidConfig"))?;
    store::update_connection(&app, &connection_id, config, credentials, default_prefix)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_fork_vault(app: tauri::AppHandle, root: String) -> Result<(), String> {
    let root = store::canonical_root(&root)?;
    store::fork_vault(&app, &root)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_vaults(app: tauri::AppHandle) -> Result<String, String> {
    serde_json::to_string(&store::vault_list(&app)?).map_err(|e| e.to_string())
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

/// The remote lock, so a run stopped by a crashed device can be recovered
/// after the person sees when it started. `token` is the lock's exact
/// bytes: unlocking passes them back and refuses a lock that changed.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_lock(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let store = store_for(&config, &credentials)?;
    let Some(raw) = store.get(LOCK_KEY).await.map_err(|e| e.to_string())? else {
        return Ok(serde_json::json!({ "locked": false }).to_string());
    };
    let started_at = Lock::parse(&raw)
        .ok()
        .map(|lock| lock.started_at)
        .unwrap_or_default();
    serde_json::to_string(&serde_json::json!({
        "locked": true,
        "startedAt": started_at,
        "token": String::from_utf8_lossy(&raw),
    }))
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_unlock(
    app: tauri::AppHandle,
    root: String,
    token: String,
) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let store = store_for(&config, &credentials)?;
    let Some(raw) = store.get(LOCK_KEY).await.map_err(|e| e.to_string())? else {
        return Ok(serde_json::json!({ "state": "noLock" }).to_string());
    };
    if raw != token.as_bytes() {
        return Err(crate::errors::error("lockLost"));
    }
    store.delete(LOCK_KEY).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "state": "unlocked" }).to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn sync_run_saved(
    app: tauri::AppHandle,
    runners: tauri::State<'_, crate::sync::runners::SyncRunners>,
    root: String,
    allow_empty_scan: bool,
    allow_bulk_delete: bool,
    open_paths: Vec<String>,
) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    let _run = runners.enter(&textus_sync::chunk::hash_hex(
        root.to_string_lossy().as_bytes(),
    ))?;
    let Some((config, credentials)) = store::load(&app, &root)? else {
        return Err(crate::errors::error("notConfigured"));
    };
    let run = async {
        let store = store_for(&config, &credentials)?;
        probe(store.as_ref()).await.map_err(|e| e.to_string())?;
        let base = store::load_base(&app, &root)?;
        let local = LocalSync::new(root.clone(), trash_for(&app, &root))
            .map_err(|e| e.to_string())?
            .with_open(open_documents(&open_paths));
        let outcome = sync(
            store.as_ref(),
            &local,
            SyncOptions {
                base,
                device: device_name(),
                keep_days: config.keep_days,
                keep_chosen: config.keep_chosen,
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

const MAX_CONFLICT_ROWS: usize = 500;
const MAX_CONFLICT_DEPTH: usize = 8;

fn walk_conflicts(dir: &Path, root: &Path, out: &mut Vec<Conflict>, depth: usize) {
    if depth > MAX_CONFLICT_DEPTH || out.len() >= MAX_CONFLICT_ROWS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_CONFLICT_ROWS {
            return;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            walk_conflicts(&path, root, out, depth + 1);
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
    let dir = root.join("Sync conflicts");
    // The folder itself must be real: a link could list another place.
    if std::fs::symlink_metadata(&dir)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Ok("[]".to_string());
    }
    let mut conflicts = Vec::new();
    walk_conflicts(&dir, &root, &mut conflicts, 0);
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
    open_paths: Vec<String>,
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
    // Restore in place when the file is still the synced one; keep a
    // version the person has edited since in a copy beside it.
    let synced = match store.get(HEAD_KEY).await.map_err(|e| e.to_string())? {
        Some(raw) => textus_sync::Manifest::parse(&raw)
            .map_err(|e| e.to_string())?
            .files
            .get(&path)
            .map(|entry| entry.hash.clone()),
        None => None,
    };
    let local = LocalSync::new(root.clone(), trash_for(&app, &root))
        .map_err(|e| e.to_string())?
        .with_open(open_documents(&open_paths));
    let existing = local.read(&path).await.map_err(|e| e.to_string())?;
    let unchanged = match &existing {
        Some(existing) => Some(textus_sync::chunk::hash_hex(existing)) == synced,
        None => synced.is_none(),
    };
    let target = if unchanged {
        path.clone()
    } else {
        {
            // Never overwrite a copy the person may have edited: put the
            // restored version beside it under a free name.
            let mut target = conflict_path(&path, &hash);
            let mut free = None;
            for _ in 0..4 {
                match local.read(&target).await.map_err(|e| e.to_string())? {
                    None => {
                        free = Some(target);
                        break;
                    }
                    Some(existing) if textus_sync::chunk::hash_hex(&existing) == hash => {
                        free = Some(target);
                        break;
                    }
                    Some(_) => target = suffixed(&target),
                }
            }
            free.ok_or_else(|| crate::errors::error("localChanged"))?
        }
    };
    let previous = if target == path {
        existing.as_deref().map(textus_sync::chunk::hash_hex)
    } else {
        local
            .read(&target)
            .await
            .map_err(|e| e.to_string())?
            .as_deref()
            .map(textus_sync::chunk::hash_hex)
    };
    if !local
        .apply(&target, bytes, previous.as_deref())
        .await
        .map_err(|e| e.to_string())?
    {
        return Err(crate::errors::error("fileOpen"));
    }
    Ok(serde_json::json!({ "path": target }).to_string())
}
