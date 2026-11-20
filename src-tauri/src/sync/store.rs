//! Where the built-in sync keeps what it needs between runs: the connection
//! per folder (secrets in an owner-only file), the local base, and the last
//! run's outcome. Nothing here is remote data or a log of file contents.

use crate::app_dirs::AppDirs;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use textus_sync::chunk::hash_hex;
use textus_sync::path::relative_path;
use textus_sync::protocol::{Base, KEEP_DAYS};
use textus_sync::SyncError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub provider: String,
    pub endpoint: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub path_style: bool,
    /// `standard` (If-None-Match) or `oss` (x-oss-forbid-overwrite).
    #[serde(default = "s3_flavor")]
    pub s3_flavor: String,
    #[serde(default = "keep")]
    pub keep_days: u32,
    /// Whether this device chose the keep setting (only then does it
    /// replace the folder's). Set when the value changes or on request.
    #[serde(default)]
    pub keep_chosen: bool,
}

fn keep() -> u32 {
    90
}

fn s3_flavor() -> String {
    "standard".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub access_key: String,
    #[serde(default)]
    pub secret_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    root: String,
    config: Config,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Configs(BTreeMap<String, Stored>);

#[derive(Debug, Default, Serialize, Deserialize)]
struct Secrets(BTreeMap<String, Credentials>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastRun {
    pub at: String,
    pub result: Option<textus_sync::SyncResult>,
    pub error: Option<String>,
}

static WRITING: Mutex<()> = Mutex::new(());

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .own_config_dir()
        .map_err(|e| e.to_string())?
        .join("sync.json"))
}

fn secrets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .own_config_dir()
        .map_err(|e| e.to_string())?
        .join("sync_secrets.json"))
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .own_data_dir()
        .map_err(|e| e.to_string())?
        .join("sync");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn root_key(root: &Path) -> String {
    hash_hex(root.to_string_lossy().as_bytes())
}

fn base_path(app: &tauri::AppHandle, root: &Path) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(format!("base-{}.json", root_key(root))))
}

fn last_path(app: &tauri::AppHandle, root: &Path) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(format!("last-{}.json", root_key(root))))
}

pub fn canonical_root(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err(crate::errors::error("notFolder"));
    }
    Ok(path)
}

pub fn load(app: &tauri::AppHandle, root: &Path) -> Result<Option<(Config, Credentials)>, String> {
    let key = root_key(root);
    let configs: Configs = crate::json_file::read_store(&config_path(app)?)?;
    let Some(stored) = configs.0.get(&key) else {
        return Ok(None);
    };
    if Path::new(&stored.root) != root {
        return Ok(None);
    }
    let secrets: Secrets = crate::json_file::read_store(&secrets_path(app)?)?;
    let credentials = secrets.0.get(&key).cloned().unwrap_or_default();
    Ok(Some((stored.config.clone(), credentials)))
}

pub fn save(
    app: &tauri::AppHandle,
    root: &Path,
    config: Config,
    credentials: Credentials,
) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let key = root_key(root);
    let mut configs: Configs = crate::json_file::read_store(&config_path(app)?)?;
    let mut config = config;
    // A changed value is a choice; the default is not, so a device that
    // never touched keep cannot reset the folder's setting.
    let previous = configs.0.get(&key).map(|stored| stored.config.keep_days);
    config.keep_chosen = config.keep_chosen
        || previous.is_some_and(|days| days != config.keep_days)
        || (previous.is_none() && config.keep_days != 90);
    let mut secrets: Secrets = crate::json_file::read_store(&secrets_path(app)?)?;
    // Switching provider must not carry the other provider's credentials
    // into the new connection.
    let same_provider = configs
        .0
        .get(&key)
        .is_some_and(|stored| stored.config.provider == config.provider);
    let old = if same_provider {
        secrets.0.get(&key).cloned().unwrap_or_default()
    } else {
        Credentials::default()
    };
    // Empty fields on a later save mean "keep what is stored", so the page
    // need not show secrets back to be able to save the rest.
    let credentials = Credentials {
        username: if credentials.username.is_empty() {
            old.username
        } else {
            credentials.username
        },
        password: if credentials.password.is_empty() {
            old.password
        } else {
            credentials.password
        },
        access_key: if credentials.access_key.is_empty() {
            old.access_key
        } else {
            credentials.access_key
        },
        secret_key: if credentials.secret_key.is_empty() {
            old.secret_key
        } else {
            credentials.secret_key
        },
    };
    validate(root, &config, &credentials)?;
    configs.0.insert(
        key.clone(),
        Stored {
            root: root.to_string_lossy().into_owned(),
            config,
        },
    );
    crate::json_file::save_pretty(&config_path(app)?, &configs).map_err(|e| e.to_string())?;
    secrets.0.insert(key, credentials);
    let json = serde_json::to_string(&secrets).map_err(|e| e.to_string())?;
    crate::atomic::write_secret_sync(&secrets_path(app)?, json).map_err(|e| e.to_string())
}

pub fn forget(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let key = root_key(root);
    let mut configs: Configs = crate::json_file::read_store(&config_path(app)?)?;
    configs.0.remove(&key);
    crate::json_file::save_pretty(&config_path(app)?, &configs).map_err(|e| e.to_string())?;
    let mut secrets: Secrets = crate::json_file::read_store(&secrets_path(app)?)?;
    secrets.0.remove(&key);
    let json = serde_json::to_string(&secrets).map_err(|e| e.to_string())?;
    crate::atomic::write_secret_sync(&secrets_path(app)?, json).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(base_path(app, root)?);
    let _ = std::fs::remove_file(last_path(app, root)?);
    Ok(())
}

pub fn load_base(app: &tauri::AppHandle, root: &Path) -> Result<Base, String> {
    let path = base_path(app, root)?;
    match std::fs::read(&path) {
        Ok(bytes) => Base::parse(&bytes).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Base::empty()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_base(app: &tauri::AppHandle, root: &Path, base: &Base) -> Result<(), String> {
    let path = base_path(app, root)?;
    crate::atomic::write_sync(&path, base.to_json().map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

pub fn save_last(app: &tauri::AppHandle, root: &Path, last: &LastRun) -> Result<(), String> {
    let path = last_path(app, root)?;
    crate::json_file::save_pretty(&path, last).map_err(|e| e.to_string())
}

pub fn load_last(app: &tauri::AppHandle, root: &Path) -> Result<Option<LastRun>, String> {
    let path = last_path(app, root)?;
    Ok(crate::json_file::read_or_set_aside(&path))
}

fn validate(root: &Path, config: &Config, credentials: &Credentials) -> Result<(), String> {
    if !matches!(config.provider.as_str(), "webdav" | "s3") {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if config.endpoint.trim().is_empty()
        || (!config.prefix.is_empty() && !relative_path(&config.prefix))
        || !KEEP_DAYS.contains(&config.keep_days)
        || !matches!(config.s3_flavor.as_str(), "standard" | "oss")
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if config.provider == "s3"
        && (config.bucket.trim().is_empty()
            || config.region.trim().is_empty()
            || credentials.access_key.is_empty()
            || credentials.secret_key.is_empty())
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if config.provider == "webdav" && credentials.username.is_empty() {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if !root.is_dir() {
        return Err(crate::errors::error("notFolder"));
    }
    Ok(())
}

pub fn settings_json(config: &Config, has_credentials: bool) -> serde_json::Value {
    serde_json::json!({ "config": config, "hasCredentials": has_credentials })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_prefix_must_be_repository_relative() {
        let root = tempfile::tempdir().unwrap();
        let config = Config {
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: "notes/a".to_string(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
            keep_days: 90,
            keep_chosen: false,
        };
        let credentials = Credentials {
            username: "u".to_string(),
            password: "p".to_string(),
            ..Credentials::default()
        };
        assert!(validate(root.path(), &config, &credentials).is_ok());
        let mut bad = config.clone();
        bad.prefix = "../notes".to_string();
        assert!(validate(root.path(), &bad, &credentials).is_err());
    }
}
