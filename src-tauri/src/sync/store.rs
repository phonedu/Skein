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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(default = "keep")]
    keep_days: u32,
    #[serde(default)]
    keep_chosen: bool,
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
}

impl SecretFile {
    fn empty() -> Self {
        Self {
            version: STORE_VERSION,
            connections: BTreeMap::new(),
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
                keep_days: config.keep_days,
                keep_chosen: config.keep_chosen,
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

fn vault_id(root: &Path) -> String {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Identity {
        vault_id: String,
    }
    if let Some(identity) = read_json::<Identity>(&identity_path(root)).ok().flatten() {
        if !identity.vault_id.is_empty() {
            return identity.vault_id;
        }
    }
    Uuid::new_v4().simple().to_string()
}

fn write_identity(root: &Path, id: &str) {
    let path = identity_path(root);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Identity {
        vault_id: String,
    }
    if let Some(identity) = read_json::<Identity>(&path).ok().flatten() {
        if !identity.vault_id.is_empty() {
            return;
        }
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(
        &path,
        serde_json::to_vec_pretty(&serde_json::json!({ "vaultId": id })).unwrap_or_default(),
    );
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
    load_at(&store_paths(app)?, root)
}

fn load_at(paths: &StorePaths, root: &Path) -> Result<Option<(Config, Credentials)>, String> {
    let key = root_key(root);
    let (store, secrets) = read_state(paths)?;
    let Some(binding) = store.vaults.get(&key) else {
        return Ok(None);
    };
    if Path::new(&binding.root) != root {
        return Ok(None);
    }
    let Some(connection) = store.connections.get(&binding.connection_id) else {
        return Ok(None);
    };
    let credentials = secrets
        .connections
        .get(&connection.id)
        .cloned()
        .unwrap_or_default();
    Ok(Some((
        Config {
            connection_id: connection.id.clone(),
            provider: connection.provider.clone(),
            endpoint: connection.endpoint.clone(),
            bucket: connection.bucket.clone(),
            prefix: binding.prefix.clone(),
            region: connection.region.clone(),
            path_style: connection.path_style,
            s3_flavor: connection.s3_flavor.clone(),
            keep_days: binding.keep_days,
            keep_chosen: binding.keep_chosen,
        },
        credentials,
    )))
}

/// Saves the connection and this vault's binding. An existing connection
/// used by other vaults keeps its endpoint and credentials: only the
/// binding (prefix and keep) changes, and empty credential fields mean
/// "keep them".
pub fn save(
    app: &tauri::AppHandle,
    root: &Path,
    config: Config,
    credentials: Credentials,
) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    save_at(&store_paths(app)?, root, config, credentials)
}

fn save_at(
    paths: &StorePaths,
    root: &Path,
    config: Config,
    credentials: Credentials,
) -> Result<(), String> {
    let key = root_key(root);
    let (mut store, mut secrets) = read_state(paths)?;
    let existing = store.vaults.get(&key).cloned();
    let requested = config.connection_id.trim().to_string();
    let connection_id = if requested == "new" {
        // The page's "new connection" choice must not fall back to the
        // folder's current connection.
        format!("c-{}", Uuid::new_v4().simple())
    } else if !requested.is_empty() {
        requested
    } else if let Some(binding) = &existing {
        binding.connection_id.clone()
    } else {
        format!("c-{key}")
    };
    let is_new = !store.connections.contains_key(&connection_id);
    let used_by_others = store
        .vaults
        .iter()
        .any(|(other, binding)| other != &key && binding.connection_id == connection_id);
    let mut connection = store
        .connections
        .get(&connection_id)
        .cloned()
        .unwrap_or(Connection {
            id: connection_id.clone(),
            provider: config.provider.clone(),
            endpoint: config.endpoint.clone(),
            bucket: String::new(),
            prefix: String::new(),
            region: String::new(),
            path_style: false,
            s3_flavor: s3_flavor(),
        });
    if !used_by_others {
        connection.provider = config.provider.clone();
        connection.endpoint = config.endpoint.clone();
        connection.bucket = config.bucket.clone();
        connection.region = config.region.clone();
        connection.path_style = config.path_style;
        connection.s3_flavor = config.s3_flavor.clone();
        if is_new {
            connection.prefix = config.prefix.trim_matches('/').to_string();
        }
    }
    validate_connection(&connection)?;
    if config.provider == "s3"
        && (connection.bucket.trim().is_empty() || connection.region.trim().is_empty())
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }

    let old_credentials = secrets
        .connections
        .get(&connection_id)
        .cloned()
        .unwrap_or_default();
    let credentials = credentials.merge(&old_credentials);
    validate_credentials(&connection.provider, &credentials)?;

    let vault_id = existing
        .as_ref()
        .map(|binding| binding.vault_id.clone())
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| vault_id(root));
    let same_binding = existing
        .as_ref()
        .is_some_and(|binding| binding.connection_id == connection_id);
    let mut prefix = config.prefix.trim_matches('/').to_string();
    if prefix.is_empty() {
        if same_binding {
            prefix = existing
                .as_ref()
                .map(|binding| binding.prefix.clone())
                .unwrap_or_default();
        } else if !is_new {
            prefix = new_prefix(&connection, root, &vault_id);
        }
    }
    if !prefix.is_empty() && !relative_path(&prefix) {
        return Err(SyncError::new("invalidPrefix").to_string());
    }
    // A one-vault connection's default follows that vault when the prefix
    // was its mirror, so a later second vault starts from the new base.
    if !used_by_others
        && existing.as_ref().is_some_and(|binding| {
            binding.connection_id == connection_id && binding.prefix == connection.prefix
        })
    {
        connection.prefix = prefix.clone();
    }
    let previous_keep = existing.as_ref().map(|binding| binding.keep_days);
    let keep_days = config.keep_days;
    if !KEEP_DAYS.contains(&keep_days) {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    let keep_chosen = config.keep_chosen
        || previous_keep.is_some_and(|days| days != keep_days)
        || (previous_keep.is_none() && keep_days != 90);

    // Two vaults must not share one repository: they would fight over the
    // same head.
    if store.vaults.iter().any(|(other, binding)| {
        other != &key && binding.connection_id == connection_id && binding.prefix == prefix
    }) {
        return Err(SyncError::new("repositoryInUse").to_string());
    }
    if let Some(binding) = &existing {
        if binding.connection_id != connection_id || binding.prefix != prefix {
            // A different remote repository: the old base would plan
            // against the wrong head.
            let _ = std::fs::remove_file(paths.base(root));
            let _ = std::fs::remove_file(paths.last(root));
        }
    }

    write_identity(root, &vault_id);
    store.connections.insert(connection_id.clone(), connection);
    store.vaults.insert(
        key,
        Binding {
            root: root.to_string_lossy().into_owned(),
            connection_id: connection_id.clone(),
            prefix,
            vault_id,
            keep_days,
            keep_chosen,
        },
    );
    secrets
        .connections
        .insert(connection_id.clone(), credentials);
    // A vault that moved to another connection leaves no orphan behind.
    if let Some(previous) = existing
        .as_ref()
        .map(|binding| binding.connection_id.clone())
        .filter(|previous| *previous != connection_id)
    {
        if !store
            .vaults
            .values()
            .any(|binding| binding.connection_id == previous)
        {
            store.connections.remove(&previous);
            secrets.connections.remove(&previous);
        }
    }
    store.version = STORE_VERSION;
    secrets.version = STORE_VERSION;
    write_state(paths, &store, &secrets)
}

pub fn forget(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    forget_at(&store_paths(app)?, root)
}

fn forget_at(paths: &StorePaths, root: &Path) -> Result<(), String> {
    let key = root_key(root);
    let (mut store, mut secrets) = read_state(paths)?;
    let connection = store
        .vaults
        .remove(&key)
        .map(|binding| binding.connection_id);
    if let Some(connection) = connection {
        if !store
            .vaults
            .values()
            .any(|binding| binding.connection_id == connection)
        {
            store.connections.remove(&connection);
            secrets.connections.remove(&connection);
        }
    }
    write_state(paths, &store, &secrets)?;
    let _ = std::fs::remove_file(paths.base(root));
    let _ = std::fs::remove_file(paths.last(root));
    Ok(())
}

pub fn load_base(app: &tauri::AppHandle, root: &Path) -> Result<Base, String> {
    load_base_at(&store_paths(app)?, root)
}

fn load_base_at(paths: &StorePaths, root: &Path) -> Result<Base, String> {
    let path = paths.base(root);
    match std::fs::read(&path) {
        Ok(bytes) => Base::parse(&bytes).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Base::empty()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_base(app: &tauri::AppHandle, root: &Path, base: &Base) -> Result<(), String> {
    save_base_at(&store_paths(app)?, root, base)
}

fn save_base_at(paths: &StorePaths, root: &Path, base: &Base) -> Result<(), String> {
    crate::atomic::write_sync(
        &paths.base(root),
        base.to_json().map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

pub fn save_last(app: &tauri::AppHandle, root: &Path, last: &LastRun) -> Result<(), String> {
    crate::json_file::save_pretty(&store_paths(app)?.last(root), last).map_err(|e| e.to_string())
}

pub fn load_last(app: &tauri::AppHandle, root: &Path) -> Result<Option<LastRun>, String> {
    Ok(crate::json_file::read_or_set_aside(
        &store_paths(app)?.last(root),
    ))
}

/// The connections a vault may bind to, with what the settings page shows.
pub fn connection_list(
    app: &tauri::AppHandle,
    root: &Path,
) -> Result<Vec<serde_json::Value>, String> {
    connection_list_at(&store_paths(app)?, root)
}

fn connection_list_at(paths: &StorePaths, root: &Path) -> Result<Vec<serde_json::Value>, String> {
    let key = root_key(root);
    let (store, secrets) = read_state(paths)?;
    let current = store
        .vaults
        .get(&key)
        .map(|binding| binding.connection_id.as_str());
    let mut list: Vec<serde_json::Value> = store
        .connections
        .values()
        .map(|connection| {
            let used_by = store
                .vaults
                .values()
                .filter(|binding| binding.connection_id == connection.id)
                .count();
            let credentials = secrets
                .connections
                .get(&connection.id)
                .cloned()
                .unwrap_or_default();
            serde_json::json!({
                "id": connection.id,
                "provider": connection.provider,
                "endpoint": connection.endpoint,
                "bucket": connection.bucket,
                "region": connection.region,
                "pathStyle": connection.path_style,
                "s3Flavor": connection.s3_flavor,
                "prefix": connection.prefix,
                "usedBy": used_by,
                "hasCredentials": credentials.has_for(&connection.provider),
                "current": current == Some(connection.id.as_str()),
            })
        })
        .collect();
    list.sort_by(|a, b| {
        a["provider"]
            .as_str()
            .cmp(&b["provider"].as_str())
            .then(a["endpoint"].as_str().cmp(&b["endpoint"].as_str()))
    });
    Ok(list)
}

fn validate_connection(connection: &Connection) -> Result<(), String> {
    if !matches!(connection.provider.as_str(), "webdav" | "s3") {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if connection.endpoint.trim().is_empty()
        || (!connection.prefix.is_empty() && !relative_path(&connection.prefix))
        || !matches!(connection.s3_flavor.as_str(), "standard" | "oss")
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    Ok(())
}

fn validate_credentials(provider: &str, credentials: &Credentials) -> Result<(), String> {
    if !credentials.has_for(provider) {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    Ok(())
}

pub fn settings_json(
    config: &Config,
    has_credentials: bool,
    connections: &[serde_json::Value],
) -> serde_json::Value {
    serde_json::json!({
        "config": config,
        "hasCredentials": has_credentials,
        "connections": connections,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy(root: &str, prefix: &str) -> (LegacyConfigs, LegacySecrets) {
        let key = hash_hex(root.as_bytes());
        let mut configs = BTreeMap::new();
        configs.insert(
            key.clone(),
            LegacyStored {
                root: root.to_string(),
                config: Config {
                    connection_id: String::new(),
                    provider: "webdav".to_string(),
                    endpoint: "https://dav.example.com".to_string(),
                    bucket: String::new(),
                    prefix: prefix.to_string(),
                    region: String::new(),
                    path_style: false,
                    s3_flavor: "standard".to_string(),
                    keep_days: 90,
                    keep_chosen: false,
                },
            },
        );
        let mut secrets = BTreeMap::new();
        secrets.insert(
            key,
            Credentials {
                username: "u".to_string(),
                password: "p".to_string(),
                ..Credentials::default()
            },
        );
        (LegacyConfigs(configs), LegacySecrets(secrets))
    }

    #[test]
    fn an_old_folder_config_becomes_one_connection_and_binding() {
        let (legacy_configs, _) = legacy("C:/vault", "notes/work");
        let (store, secrets) = migrate(legacy_configs, LegacySecrets::default());
        assert_eq!(store.version, STORE_VERSION);
        assert_eq!(store.connections.len(), 1);
        assert_eq!(store.vaults.len(), 1);
        let binding = store.vaults.values().next().unwrap();
        assert_eq!(binding.prefix, "notes/work");
        assert_eq!(
            &binding.connection_id,
            store.connections.keys().next().unwrap()
        );
        assert!(secrets.connections.is_empty());
    }

    #[test]
    fn migration_brings_the_credentials_along() {
        let (legacy_configs, legacy_secrets) = legacy("C:/vault", "notes/work");
        let (store, secrets) = migrate(legacy_configs, legacy_secrets);
        let id = store.connections.keys().next().unwrap();
        assert_eq!(secrets.connections[id].username, "u");
    }

    #[test]
    fn a_new_shared_vault_gets_a_sub_repository() {
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: "notes".to_string(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        let prefix = new_prefix(
            &connection,
            Path::new("C:/Vaults/Work Notes"),
            "0123456789abcdef",
        );
        assert_eq!(prefix, "notes/work-notes-01234567");
    }

    #[test]
    fn the_old_file_shape_is_recognized_before_the_new_one() {
        let (configs, _) = legacy("C:/vault", "notes/work");
        let json = serde_json::to_vec(&configs).unwrap();
        assert!(matches!(
            serde_json::from_slice::<AnyStore>(&json).unwrap(),
            AnyStore::Legacy(_)
        ));
        let store = StoreFile::empty();
        let json = serde_json::to_vec(&store).unwrap();
        assert!(matches!(
            serde_json::from_slice::<AnyStore>(&json).unwrap(),
            AnyStore::Current(_)
        ));
    }

    #[test]
    fn a_vault_under_an_empty_base_gets_its_own_folder() {
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: String::new(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        assert_eq!(
            new_prefix(&connection, Path::new("C:/Vault/个人"), "abcdef0123"),
            "vault-abcdef01"
        );
    }

    #[test]
    fn webdav_may_have_an_empty_password_but_s3_may_not() {
        let webdav = Credentials {
            username: "u".to_string(),
            ..Credentials::default()
        };
        assert!(webdav.has_for("webdav"));
        assert!(!webdav.has_for("s3"));
    }

    fn test_paths(dir: &Path) -> StorePaths {
        let data = dir.join("data");
        std::fs::create_dir_all(&data).unwrap();
        StorePaths {
            config: dir.join("config/sync.json"),
            secrets: dir.join("config/sync_secrets.json"),
            data,
        }
    }

    fn webdav_config() -> Config {
        Config {
            connection_id: String::new(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: String::new(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
            keep_days: 90,
            keep_chosen: false,
        }
    }

    fn webdav_credentials() -> Credentials {
        Credentials {
            username: "u".to_string(),
            password: "p".to_string(),
            ..Credentials::default()
        }
    }

    #[test]
    fn a_saved_vault_reads_back_its_connection_and_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        let (config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(config.provider, "webdav");
        assert!(!config.connection_id.is_empty());
        assert_eq!(credentials.username, "u");
        let list = connection_list_at(&paths, &root).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["usedBy"], 1);
        assert_eq!(list[0]["current"], true);
        assert!(root.join(".textus/sync-vault.json").exists());
    }

    #[test]
    fn a_second_vault_can_share_the_connection_and_gets_a_sub_repository() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let second = dir.path().join("vault2");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &first, webdav_config(), webdav_credentials()).unwrap();
        let (saved, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut shared = webdav_config();
        shared.connection_id = saved.connection_id.clone();
        save_at(&paths, &second, shared, Credentials::default()).unwrap();

        let (bound, credentials) = load_at(&paths, &second).unwrap().unwrap();
        assert_eq!(bound.connection_id, saved.connection_id);
        assert!(bound.prefix.starts_with("vault2-"));
        assert_eq!(credentials.username, "u");
        let list = connection_list_at(&paths, &first).unwrap();
        assert_eq!(list[0]["usedBy"], 2);
    }

    #[test]
    fn changing_the_remote_prefix_rebuilds_the_base() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        save_base_at(&paths, &root, &Base::empty()).unwrap();
        assert!(paths.base(&root).exists());

        let (mut config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        config.prefix = "another/repository".to_string();
        save_at(&paths, &root, config, credentials).unwrap();
        assert!(!paths.base(&root).exists());
    }

    #[test]
    fn forgetting_the_last_vault_removes_its_connection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        forget_at(&paths, &root).unwrap();
        assert!(load_at(&paths, &root).unwrap().is_none());
        assert!(connection_list_at(&paths, &root).unwrap().is_empty());
        let (store, secrets) = read_state(&paths).unwrap();
        assert!(store.connections.is_empty());
        assert!(secrets.connections.is_empty());
    }

    #[test]
    fn an_old_setup_loads_before_it_is_rewritten() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        std::fs::create_dir_all(paths.config.parent().unwrap()).unwrap();
        let key = root_key(&root);
        let mut configs = BTreeMap::new();
        configs.insert(
            key.clone(),
            LegacyStored {
                root: root.to_string_lossy().into_owned(),
                config: Config {
                    connection_id: String::new(),
                    prefix: "legacy/notes".to_string(),
                    ..webdav_config()
                },
            },
        );
        let mut secrets = BTreeMap::new();
        secrets.insert(key, webdav_credentials());
        std::fs::write(
            &paths.config,
            serde_json::to_vec(&LegacyConfigs(configs)).unwrap(),
        )
        .unwrap();
        std::fs::write(
            &paths.secrets,
            serde_json::to_vec(&LegacySecrets(secrets)).unwrap(),
        )
        .unwrap();

        let (config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(config.prefix, "legacy/notes");
        assert_eq!(credentials.username, "u");
        save_at(&paths, &root, config, credentials).unwrap();
        let saved: AnyStore =
            serde_json::from_slice(&std::fs::read(&paths.config).unwrap()).unwrap();
        assert!(matches!(saved, AnyStore::Current(_)));
    }

    #[test]
    fn two_vaults_cannot_bind_the_same_repository() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let second = dir.path().join("vault2");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let paths = test_paths(dir.path());
        let mut base = webdav_config();
        base.prefix = "work".to_string();
        save_at(&paths, &first, base, webdav_credentials()).unwrap();
        let (saved, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut same = webdav_config();
        same.connection_id = saved.connection_id;
        same.prefix = "work".to_string();
        let error = save_at(&paths, &second, same, Credentials::default()).unwrap_err();
        assert!(error.contains("repositoryInUse"), "{error}");
    }

    #[test]
    fn the_new_choice_makes_a_second_connection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        let (first, _) = load_at(&paths, &root).unwrap().unwrap();
        let mut next = webdav_config();
        next.connection_id = "new".to_string();
        next.endpoint = "https://other.example.com".to_string();
        save_at(&paths, &root, next, webdav_credentials()).unwrap();
        let (second, _) = load_at(&paths, &root).unwrap().unwrap();
        assert_ne!(first.connection_id, second.connection_id);
        let (store, _) = read_state(&paths).unwrap();
        assert_eq!(store.connections.len(), 1);
        assert_eq!(second.endpoint, "https://other.example.com");
    }

    #[test]
    fn a_prefix_must_be_repository_relative() {
        let credentials = Credentials {
            username: "u".to_string(),
            password: "p".to_string(),
            ..Credentials::default()
        };
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: "../notes".to_string(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        assert!(validate_connection(&connection).is_err());
        assert!(validate_credentials("webdav", &credentials).is_ok());
    }
}
