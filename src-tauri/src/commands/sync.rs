//! The built-in sync's commands. Settings stores the connection per folder;
//! a run reads that connection, the owner-only secrets and the local base,
//! then publishes the result. Request fields are JSON so the generated
//! bindings stay small and no credential is logged.

use crate::sync::local::{LocalSync, TrashFile};
use crate::sync::plugin;
use crate::sync::store::{self, Config, Credentials, LastRun};
use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use textus_sync::open_encrypted_store;
use textus_sync::path::conflict_path;
use textus_sync::protocol::{HEAD_KEY, HISTORY_KEY, LOCK_KEY};
use textus_sync::{
    preview, probe, read_entry, sync, Base, History, LocalFiles, Lock, ObjectStore, S3Store,
    SyncOptions, SyncResult, WebDavStore,
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
                match config.s3_flavor.as_str() {
                    "oss" => textus_sync::s3::S3Flavor::Oss,
                    "kodo" => textus_sync::s3::S3Flavor::Kodo,
                    _ => textus_sync::s3::S3Flavor::Standard,
                },
            )
            .map_err(|e| e.to_string())?,
        )),
        _ => Err(crate::errors::error("invalidConfig")),
    }
}

/// The transport, wrapped in the encrypted store when this vault (or the
/// remote descriptor) says the repository is encrypted. A read-only caller
/// with no remote head gets the raw store: there is nothing encrypted to
/// open yet.
async fn open_store(
    app: &tauri::AppHandle,
    config: &Config,
    credentials: &Credentials,
    create: bool,
) -> Result<Box<dyn ObjectStore>, String> {
    let raw = store_for(config, credentials)?;
    let descriptor = raw.get(HEAD_KEY).await.map_err(|e| e.to_string())?;
    let remote_encrypted = descriptor
        .as_deref()
        .is_some_and(textus_sync::encryption::is_encryption_descriptor);
    if !config.encrypted && !remote_encrypted {
        return Ok(raw);
    }
    if !create && descriptor.is_none() {
        return Ok(raw);
    }
    let secret = store::load_vault_secret(app, &config.vault_id)?;
    if secret.sync_password.is_empty() {
        return Err("syncPasswordRequired".to_string());
    }
    let pin = (!secret.pin.is_empty()).then_some(secret.pin.as_str());
    let store = open_encrypted_store(raw, &secret.sync_password, pin)
        .await
        .map_err(|e| e.to_string())?;
    store::save_vault_pin(app, &config.vault_id, store.fingerprint())?;
    Ok(Box::new(store))
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
    let secret = store::load_vault_secret(&app, &config.vault_id)?;
    let mut value = store::settings_json(
        &config,
        credentials.has_for(&config.provider),
        !secret.sync_password.is_empty(),
        &connections,
    );
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

/// Imports the Cloud Sync plugin's connection, credentials and baseline
/// for this folder. The page asks first; the plugin's own data stays.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn sync_plugin_import(app: tauri::AppHandle, root: String) -> Result<String, String> {
    let root = store::canonical_root(&root)?;
    if store::load(&app, &root)?.is_some() {
        return Err("alreadyConfigured".to_string());
    }
    let Some(imported) = crate::sync::plugin::find(&app, &root)? else {
        return Err("pluginNotFound".to_string());
    };
    let summary = serde_json::json!({
        "provider": imported.config.provider,
        "prefix": imported.config.prefix,
        "encrypted": imported.config.encrypted,
        "files": imported.base.files.len(),
    });
    store::save(&app, &root, imported.config, imported.credentials)?;
    if let Err(error) = store::save_base(&app, &root, &imported.base) {
        let _ = store::forget(&app, &root);
        return Err(error);
    }
    if !imported.pin.is_empty() {
        if let Some((config, _)) = store::load(&app, &root)? {
            store::save_vault_pin(&app, &config.vault_id, &imported.pin)?;
        }
    }
    Ok(summary.to_string())
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
    Ok(serde_json::json!({
        "configured": configured,
        "last": last,
        "pluginConfigured": plugin::configured(&app, &root),
        "pluginRunning": plugin::running(&app)
    })
    .to_string())
}

/// What a first sync would do, without writing anything.

#[path = "sync_run.rs"]
mod sync_run;
pub use sync_run::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn s3_config(flavor: &str, region: &str) -> Config {
        Config {
            connection_id: "c-test".to_string(),
            provider: "s3".to_string(),
            endpoint: "https://s3.cn-south-1.qiniucs.com".to_string(),
            bucket: "bucket".to_string(),
            prefix: "notes".to_string(),
            region: region.to_string(),
            path_style: true,
            s3_flavor: flavor.to_string(),
            keep_days: 90,
            keep_chosen: false,
            encrypted: false,
            vault_id: String::new(),
        }
    }

    #[test]
    fn a_kodo_setting_builds_the_native_store() {
        let credentials = Credentials {
            access_key: "ak".to_string(),
            secret_key: "sk".to_string(),
            ..Credentials::default()
        };
        assert!(store_for(&s3_config("kodo", "cn-south-1"), &credentials).is_ok());
        assert_eq!(
            store_for(&s3_config("kodo", "eu-west-1"), &credentials)
                .err()
                .unwrap(),
            "unsupportedRegion"
        );
    }
}
