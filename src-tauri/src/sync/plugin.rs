//! Reading the Cloud Sync plugin's per-folder settings, credentials and
//! baseline, so a folder can move to the built-in sync without retyping the
//! connection. The user is asked before this runs; nothing is deleted from
//! the plugin.

use crate::app_dirs::AppDirs;
use crate::sync::store::{Config, Credentials};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::Manager;
use textus_sync::chunk::hash_hex;
use textus_sync::Base;

const PLUGIN_ID: &str = "catvinci.cloud-sync";

pub struct Imported {
    pub config: Config,
    pub credentials: Credentials,
    pub base: Base,
    pub pin: String,
}

pub fn find(app: &tauri::AppHandle, root: &Path) -> Result<Option<Imported>, String> {
    let global = crate::ai::workspace::global_agent_dir(app)?;
    let plugin = global.join("plugins").join(PLUGIN_ID);
    let secrets = app
        .path()
        .own_config_dir()
        .map_err(|error| error.to_string())?
        .join("plugin_secrets.json");
    find_at(&plugin, &secrets, root)
}

/// Whether the plugin still has this folder configured, whether or not it
/// has credentials. Read to warn that two syncs would write different bases.
pub fn configured(app: &tauri::AppHandle, root: &Path) -> bool {
    let Ok(global) = crate::ai::workspace::global_agent_dir(app) else {
        return false;
    };
    configured_at(&global.join("plugins").join(PLUGIN_ID), root)
}

/// Whether the plugin is installed and switched on. A stopped plugin does
/// not run, so the warning can say only that it is safe to uninstall.
pub fn running(app: &tauri::AppHandle) -> bool {
    crate::plugins::state::read(app).runs(PLUGIN_ID)
}

fn configured_at(plugin: &Path, root: &Path) -> bool {
    roots(root).iter().any(|root_text| {
        let config_key = format!("config:{}", hash_hex(root_text.as_bytes()));
        read_kv(&plugin.join("kv"), &config_key)
            .ok()
            .flatten()
            .is_some_and(|config| {
                matches!(
                    config["provider"].as_str().unwrap_or_default(),
                    "s3" | "webdav" | "nutstore"
                )
            })
    })
}

fn find_at(plugin: &Path, secrets_path: &Path, root: &Path) -> Result<Option<Imported>, String> {
    for root_text in roots(root) {
        let config_key = format!("config:{}", hash_hex(root_text.as_bytes()));
        let Some(config) = read_kv(&plugin.join("kv"), &config_key)? else {
            continue;
        };
        let provider = config["provider"].as_str().unwrap_or_default();
        if !matches!(provider, "s3" | "webdav" | "nutstore") {
            continue;
        }
        let transport = if provider == "s3" { "s3" } else { "dav" };
        let endpoint = config["endpoint"].as_str().unwrap_or_default();
        let endpoint = if provider == "nutstore" && endpoint.is_empty() {
            "https://dav.jianguoyun.com/dav"
        } else {
            endpoint
        };
        let bucket = config["bucket"].as_str().unwrap_or_default();
        let region = config["region"].as_str().unwrap_or_default();
        let prefix = config["prefix"].as_str().unwrap_or_default();
        let path_style = config["pathStyle"].as_bool().unwrap_or(false);
        let identity = serde_json::to_string(&serde_json::json!([
            transport, endpoint, bucket, region, path_style, prefix
        ]))
        .map_err(|error| error.to_string())?;

        let secret_key = format!(
            "connection:{}",
            hash_hex(format!("{root_text}{identity}").as_bytes())
        );
        let Some(secret) = read_secret(secrets_path, &secret_key)? else {
            return Err("credentialsRequired".to_string());
        };
        let account = secret["account"].as_str().unwrap_or_default();
        let password = secret["secret"].as_str().unwrap_or_default();
        if account.is_empty() || password.is_empty() {
            return Err("credentialsRequired".to_string());
        }
        let base_key = format!(
            "encrypted-base:{}",
            hash_hex(format!("{root_text}{identity}\n{account}").as_bytes())
        );
        let base = match read_kv(&plugin.join("kv"), &base_key)? {
            Some(value) => Base::parse(&serde_json::to_vec(&value).map_err(|e| e.to_string())?)
                .map_err(|error| error.to_string())?,
            None => Base::empty(),
        };
        let pin = read_kv(&plugin.join("kv"), &format!("vault:{base_key}"))?
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_default();
        let keep_days = config["keepDays"].as_u64().unwrap_or(90) as u32;
        let encrypted = config["encrypt"].as_bool().unwrap_or(false);
        let sync_password = secret["syncPassword"].as_str().unwrap_or_default();
        return Ok(Some(Imported {
            config: Config {
                connection_id: String::new(),
                provider: if provider == "s3" { "s3" } else { "webdav" }.to_string(),
                endpoint: endpoint.to_string(),
                bucket: bucket.to_string(),
                prefix: prefix.to_string(),
                region: region.to_string(),
                path_style,
                s3_flavor: "standard".to_string(),
                keep_days,
                keep_chosen: config["keepPending"].as_bool().unwrap_or(false),
                encrypted,
                vault_id: String::new(),
            },
            credentials: if provider == "s3" {
                Credentials {
                    access_key: account.to_string(),
                    secret_key: password.to_string(),
                    sync_password: sync_password.to_string(),
                    ..Credentials::default()
                }
            } else {
                Credentials {
                    username: account.to_string(),
                    password: password.to_string(),
                    sync_password: sync_password.to_string(),
                    ..Credentials::default()
                }
            },
            base,
            pin: pin.to_string(),
        }));
    }
    Ok(None)
}

fn roots(root: &Path) -> Vec<String> {
    let text = root.to_string_lossy().into_owned();
    let plain = text.strip_prefix(r"\\?\").unwrap_or(&text).to_string();
    let slashed = plain.replace('\\', "/");
    let mut roots = vec![text, plain, slashed];
    roots.dedup();
    roots
}

fn key_file(key: &str) -> String {
    let mut out = String::with_capacity(key.len() + 5);
    for byte in key.bytes() {
        if byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_' {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out.push_str(".json");
    out
}

fn read_kv(dir: &Path, key: &str) -> Result<Option<Value>, String> {
    let path: PathBuf = dir.join(key_file(key));
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn read_secret(path: &Path, key: &str) -> Result<Option<Value>, String> {
    let raw = match std::fs::read(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let value: Value = serde_json::from_slice(&raw).map_err(|error| error.to_string())?;
    let Some(plugin) = value.get(PLUGIN_ID) else {
        return Ok(None);
    };
    let Some(text) = plugin.get(key).and_then(Value::as_str) else {
        return Ok(None);
    };
    serde_json::from_str(text)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// A plugin data folder holding the config an old Textus wrote for
    /// `root`: the two tests differ only in that config and in what more
    /// they put beside it.
    fn plugin_with_config(
        root: &str,
        config: &serde_json::Value,
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let plugin = dir.path().join("plugin");
        let kv = plugin.join("kv");
        std::fs::create_dir_all(&kv).unwrap();
        let config_key = format!("config:{}", hash_hex(root.as_bytes()));
        std::fs::write(
            kv.join(key_file(&config_key)),
            serde_json::to_vec(config).unwrap(),
        )
        .unwrap();
        (dir, plugin)
    }

    #[test]
    fn an_old_plugin_config_imports_connection_credentials_base_and_pin() {
        let root = "C:/Vault";
        let (dir, plugin) = plugin_with_config(
            root,
            &serde_json::json!({
                "provider": "webdav",
                "endpoint": "https://dav.example.com",
                "region": "",
                "bucket": "",
                "prefix": "notes/work",
                "pathStyle": false,
                "encrypt": true,
                "keepDays": 365,
                "keepPending": true
            }),
        );
        let kv = plugin.join("kv");
        let identity = serde_json::to_string(&serde_json::json!([
            "dav",
            "https://dav.example.com",
            "",
            "",
            false,
            "notes/work"
        ]))
        .unwrap();
        let secret_key = format!(
            "connection:{}",
            hash_hex(format!("{root}{identity}").as_bytes())
        );
        let base_key = format!(
            "encrypted-base:{}",
            hash_hex(format!("{root}{identity}\nspike").as_bytes())
        );
        std::fs::write(
            kv.join(key_file(&base_key)),
            serde_json::to_vec(&serde_json::json!({
                "format": "textus-cloud-sync/1",
                "files": {"notes/a.md": "a".repeat(64)}
            }))
            .unwrap(),
        )
        .unwrap();
        std::fs::write(
            kv.join(key_file(&format!("vault:{base_key}"))),
            serde_json::to_vec(&"b".repeat(64)).unwrap(),
        )
        .unwrap();
        let secrets_path = dir.path().join("plugin_secrets.json");
        let mut secrets = BTreeMap::new();
        let mut plugin_secrets = BTreeMap::new();
        plugin_secrets.insert(
            secret_key,
            serde_json::to_string(&serde_json::json!({
                "account": "spike",
                "secret": "spike-pass",
                "syncPassword": "correct horse battery"
            }))
            .unwrap(),
        );
        secrets.insert(PLUGIN_ID, plugin_secrets);
        std::fs::write(&secrets_path, serde_json::to_vec(&secrets).unwrap()).unwrap();

        let imported = find_at(&plugin, &secrets_path, Path::new(root))
            .unwrap()
            .unwrap();
        assert_eq!(imported.config.provider, "webdav");
        assert_eq!(imported.config.prefix, "notes/work");
        assert_eq!(imported.config.keep_days, 365);
        assert!(imported.config.encrypted);
        assert_eq!(imported.credentials.username, "spike");
        assert_eq!(imported.credentials.sync_password, "correct horse battery");
        assert_eq!(imported.base.files.len(), 1);
        assert_eq!(imported.pin, "b".repeat(64));
    }

    #[test]
    fn a_configured_folder_is_detected_without_its_secrets() {
        let root = "C:/Vault";
        let (_dir, plugin) = plugin_with_config(
            root,
            &serde_json::json!({
                "provider": "s3",
                "endpoint": "https://s3.example.com",
                "bucket": "notes",
                "prefix": "work"
            }),
        );

        assert!(configured_at(&plugin, Path::new(root)));
        assert!(!configured_at(&plugin, Path::new("C:/Other")));
    }
}
