//! Where the built-in sync keeps what it needs between runs: connections
//! shared by vaults (secrets in an owner-only file), each vault's binding
//! to a connection and prefix, the local base, and the last run's outcome.
//! Nothing here is remote data or a log of file contents.

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
use uuid::Uuid;

const STORE_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// The connection this vault binds to; empty means "make one for this
    /// folder" (what a fresh setup does).
    #[serde(default)]
    pub connection_id: String,
    pub provider: String,
    pub endpoint: String,
    #[serde(default)]
    pub bucket: String,
    /// This vault's effective remote prefix.
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
    /// Whether this vault's repository is end-to-end encrypted.
    #[serde(default)]
    pub encrypted: bool,
    /// The local vault identity; secrets are keyed by it, so a moved
    /// folder keeps its password.
    #[serde(default)]
    pub vault_id: String,
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
    /// Per-vault encryption password; never stored with the connection.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub sync_password: String,
}

impl Credentials {
    fn merge(&self, old: &Credentials) -> Credentials {
        Credentials {
            username: if self.username.is_empty() {
                old.username.clone()
            } else {
                self.username.clone()
            },
            password: if self.password.is_empty() {
                old.password.clone()
            } else {
                self.password.clone()
            },
            access_key: if self.access_key.is_empty() {
                old.access_key.clone()
            } else {
                self.access_key.clone()
            },
            secret_key: if self.secret_key.is_empty() {
                old.secret_key.clone()
            } else {
                self.secret_key.clone()
            },
            sync_password: String::new(),
        }
    }

    pub fn has_for(&self, provider: &str) -> bool {
        if provider == "s3" {
            !self.access_key.is_empty() && !self.secret_key.is_empty()
        } else {
            // WebDAV servers may take an empty password.
            !self.username.is_empty()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    id: String,
    provider: String,
    endpoint: String,
    #[serde(default)]
    bucket: String,
    /// The base under which a new vault of this connection gets its own
    /// sub-repository.
    #[serde(default)]
    prefix: String,
    #[serde(default)]
    region: String,
    #[serde(default)]
    path_style: bool,
    #[serde(default = "s3_flavor")]
    s3_flavor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Binding {
    root: String,
    connection_id: String,
    prefix: String,
    #[serde(default)]
    vault_id: String,
    /// The remote repository this binding writes to; a new one follows a
    /// connection or prefix change, and the local base is named after it.
    #[serde(default)]
    repository_id: String,
    #[serde(default = "keep")]
    keep_days: u32,
    #[serde(default)]
    keep_chosen: bool,
    #[serde(default)]
    encrypted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreFile {
    version: u32,
    #[serde(default)]
    connections: BTreeMap<String, Connection>,
    #[serde(default)]
    vaults: BTreeMap<String, Binding>,
}

impl StoreFile {
    fn empty() -> Self {
        Self {
            version: STORE_VERSION,
            connections: BTreeMap::new(),
            vaults: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretFile {
    version: u32,
    #[serde(default)]
    connections: BTreeMap<String, Credentials>,
    /// Password and descriptor pin, per local vault identity.
    #[serde(default)]
    vaults: BTreeMap<String, VaultSecret>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSecret {
    #[serde(default)]
    pub sync_password: String,
    #[serde(default)]
    pub pin: String,
}

impl SecretFile {
    fn empty() -> Self {
        Self {
            version: STORE_VERSION,
            connections: BTreeMap::new(),
            vaults: BTreeMap::new(),
        }
    }
}

// The pre-multi-vault files: a map from a folder's hash to its own config,
// and the same key to its credentials. Read once, then rewritten in the
// connection/binding shape on the next save.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyStored {
    root: String,
    config: Config,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LegacyConfigs(BTreeMap<String, LegacyStored>);

#[derive(Debug, Default, Serialize, Deserialize)]
struct LegacySecrets(BTreeMap<String, Credentials>);

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AnyStore {
    Current(StoreFile),
    Legacy(LegacyConfigs),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AnySecrets {
    Current(SecretFile),
    Legacy(LegacySecrets),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastRun {
    pub at: String,
    pub result: Option<textus_sync::SyncResult>,
    pub error: Option<String>,
}

static WRITING: Mutex<()> = Mutex::new(());

struct StorePaths {
    config: PathBuf,
    secrets: PathBuf,
    data: PathBuf,
}

impl StorePaths {
    fn base(&self, root: &Path) -> PathBuf {
        self.data.join(format!("base-{}.json", root_key(root)))
    }

    /// The base of a bound vault. A vault with an identity and repository
    /// keeps it when its folder moves; older bindings fall back to the
    /// folder's key until their next save.
    fn base_for(&self, root: &Path, binding: Option<&Binding>) -> PathBuf {
        match binding {
            Some(binding) if !binding.vault_id.is_empty() && !binding.repository_id.is_empty() => {
                self.data.join(format!(
                    "base-{}-{}.json",
                    binding.vault_id, binding.repository_id
                ))
            }
            _ => self.base(root),
        }
    }

    fn last(&self, root: &Path) -> PathBuf {
        self.data.join(format!("last-{}.json", root_key(root)))
    }
}

fn store_paths(app: &tauri::AppHandle) -> Result<StorePaths, String> {
    let config = app.path().own_config_dir().map_err(|e| e.to_string())?;
    let data = app
        .path()
        .own_data_dir()
        .map_err(|e| e.to_string())?
        .join("sync");
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    Ok(StorePaths {
        config: config.join("sync.json"),
        secrets: config.join("sync_secrets.json"),
        data,
    })
}

fn root_key(root: &Path) -> String {
    hash_hex(root.to_string_lossy().as_bytes())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(crate::json_file::parse_or_set_aside(path, &bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn read_state(paths: &StorePaths) -> Result<(StoreFile, SecretFile), String> {
    let store = read_json::<AnyStore>(&paths.config)?;
    let secrets = read_json::<AnySecrets>(&paths.secrets)?;
    Ok(match (store, secrets) {
        (Some(AnyStore::Current(store)), Some(AnySecrets::Current(secrets))) => (store, secrets),
        (Some(AnyStore::Current(store)), Some(AnySecrets::Legacy(secrets))) => (
            store,
            SecretFile {
                version: STORE_VERSION,
                connections: secrets.0,
                vaults: BTreeMap::new(),
            },
        ),
        (Some(AnyStore::Current(store)), None) => (store, SecretFile::empty()),
        (Some(AnyStore::Legacy(store)), secrets) => {
            let legacy_secrets = match secrets {
                Some(AnySecrets::Legacy(secrets)) => secrets,
                _ => LegacySecrets::default(),
            };
            migrate(store, legacy_secrets)
        }
        (None, Some(AnySecrets::Current(secrets))) => (StoreFile::empty(), secrets),
        (None, Some(AnySecrets::Legacy(secrets))) => (
            StoreFile::empty(),
            SecretFile {
                version: STORE_VERSION,
                connections: secrets.0,
                vaults: BTreeMap::new(),
            },
        ),
        (None, None) => (StoreFile::empty(), SecretFile::empty()),
    })
}

fn write_state(paths: &StorePaths, store: &StoreFile, secrets: &SecretFile) -> Result<(), String> {
    crate::json_file::save_pretty(&paths.config, store).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
    crate::atomic::write_secret_sync(&paths.secrets, json).map_err(|e| e.to_string())
}

/// An old per-folder config becomes a connection of its own, with the same
/// prefix, so nothing in an existing setup moves.
fn migrate(legacy: LegacyConfigs, secrets: LegacySecrets) -> (StoreFile, SecretFile) {
    let mut store = StoreFile::empty();
    let mut secret_file = SecretFile::empty();
    for (key, stored) in legacy.0 {
        let id = format!("c-{key}");
        let config = stored.config;
        store.connections.insert(
            id.clone(),
            Connection {
                id: id.clone(),
                provider: config.provider.clone(),
                endpoint: config.endpoint.clone(),
                bucket: config.bucket.clone(),
                prefix: config.prefix.clone(),
                region: config.region.clone(),
                path_style: config.path_style,
                s3_flavor: config.s3_flavor.clone(),
            },
        );
        store.vaults.insert(
            key.clone(),
            Binding {
                root: stored.root,
                connection_id: id.clone(),
                prefix: config.prefix,
                vault_id: String::new(),
                repository_id: String::new(),
                keep_days: config.keep_days,
                keep_chosen: config.keep_chosen,
                encrypted: false,
            },
        );
        if let Some(credentials) = secrets.0.get(&key) {
            secret_file.connections.insert(id, credentials.clone());
        }
    }
    (store, secret_file)
}

fn identity_path(root: &Path) -> PathBuf {
    root.join(".textus").join("sync-vault.json")
}

fn read_identity(root: &Path) -> Option<String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Identity {
        vault_id: String,
    }
    read_json::<Identity>(&identity_path(root))
        .ok()
        .flatten()
        .map(|identity| identity.vault_id)
        .filter(|id| !id.is_empty())
}

fn vault_id(root: &Path) -> String {
    read_identity(root).unwrap_or_else(|| Uuid::new_v4().simple().to_string())
}

fn write_identity_file(root: &Path, id: &str) {
    let path = identity_path(root);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(
        &path,
        serde_json::to_vec_pretty(&serde_json::json!({ "vaultId": id })).unwrap_or_default(),
    );
}

fn write_identity(root: &Path, id: &str) {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Identity {
        vault_id: String,
    }
    if let Some(identity) = read_json::<Identity>(&identity_path(root)).ok().flatten() {
        if !identity.vault_id.is_empty() {
            return;
        }
    }
    write_identity_file(root, id);
}

fn slug(root: &Path) -> String {
    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mut slug = String::new();
    let mut dash = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "vault".to_string()
    } else {
        slug.chars().take(32).collect()
    }
}

fn new_prefix(connection: &Connection, root: &Path, vault_id: &str) -> String {
    let base = connection.prefix.trim_matches('/');
    let id = vault_id.get(..8).unwrap_or(vault_id);
    let sub = format!("{}-{id}", slug(root));
    if base.is_empty() {
        sub
    } else {
        format!("{base}/{sub}")
    }
}


#[path = "store_ops.rs"]
mod store_ops;
pub use store_ops::*;

#[path = "store_admin.rs"]
mod store_admin;
pub use store_admin::*;

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
