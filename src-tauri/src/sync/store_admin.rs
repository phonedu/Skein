//! Forgetting a binding, bases and last runs, and the connection and vault lists.

use super::*;
use super::store_ops::*;

pub fn forget(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    forget_at(&store_paths(app)?, root)
}

pub(super) fn forget_at(paths: &StorePaths, root: &Path) -> Result<(), String> {
    let (mut store, mut secrets) = read_state(paths)?;
    let Some((key, binding)) = resolved_binding(&store, root) else {
        return Ok(());
    };
    let base = paths.base_for(root, Some(&binding));
    let old_last = paths.last(Path::new(&binding.root));
    let vault_id = binding.vault_id.clone();
    let connection = store
        .vaults
        .remove(&key)
        .map(|binding| binding.connection_id);
    secrets.vaults.remove(&vault_id);
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
    let _ = std::fs::remove_file(base);
    let _ = std::fs::remove_file(&old_last);
    let _ = std::fs::remove_file(paths.last(root));
    Ok(())
}

pub fn load_base(app: &tauri::AppHandle, root: &Path) -> Result<Base, String> {
    load_base_at(&store_paths(app)?, root)
}

pub(super) fn load_base_at(paths: &StorePaths, root: &Path) -> Result<Base, String> {
    let (store, _) = read_state(paths)?;
    let binding = resolved_binding(&store, root).map(|(_, binding)| binding);
    let path = paths.base_for(root, binding.as_ref());
    match std::fs::read(&path) {
        Ok(bytes) => Base::parse(&bytes).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Base::empty()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_base(app: &tauri::AppHandle, root: &Path, base: &Base) -> Result<(), String> {
    save_base_at(&store_paths(app)?, root, base)
}

pub(super) fn save_base_at(paths: &StorePaths, root: &Path, base: &Base) -> Result<(), String> {
    let (store, _) = read_state(paths)?;
    let binding = resolved_binding(&store, root).map(|(_, binding)| binding);
    crate::atomic::write_sync(
        &paths.base_for(root, binding.as_ref()),
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

pub(super) fn connection_list_at(paths: &StorePaths, root: &Path) -> Result<Vec<serde_json::Value>, String> {
    let (store, secrets) = read_state(paths)?;
    let current = resolved_binding(&store, root).map(|(_, binding)| binding.connection_id);
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
                "current": current.as_deref() == Some(connection.id.as_str()),
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

/// Changes a connection used by one or more vaults. The bound vaults keep
/// their own prefixes; if the remote address changes, each one's base is
/// dropped so the next run plans against the new repository.
pub fn update_connection(
    app: &tauri::AppHandle,
    connection_id: &str,
    config: Config,
    credentials: Credentials,
    default_prefix: Option<String>,
) -> Result<String, String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    update_connection_at(
        &store_paths(app)?,
        connection_id,
        config,
        credentials,
        default_prefix.as_deref(),
    )
}

pub(super) fn update_connection_at(
    paths: &StorePaths,
    connection_id: &str,
    config: Config,
    credentials: Credentials,
    default_prefix: Option<&str>,
) -> Result<String, String> {
    let (mut store, mut secrets) = read_state(paths)?;
    let Some(existing) = store.connections.get(connection_id).cloned() else {
        return Err(SyncError::new("notFound").to_string());
    };
    let mut connection = existing.clone();
    connection.provider = config.provider;
    connection.endpoint = config.endpoint;
    connection.bucket = config.bucket;
    connection.region = config.region;
    connection.path_style = config.path_style;
    connection.s3_flavor = config.s3_flavor;
    normalize_connection(&mut connection)?;
    let remote_changed = connection != existing;
    if let Some(prefix) = default_prefix {
        let prefix = prefix.trim_matches('/').to_string();
        if !prefix.is_empty() && !relative_path(&prefix) {
            return Err(SyncError::new("invalidPrefix").to_string());
        }
        connection.prefix = prefix;
    }
    validate_connection(&connection)?;
    if connection.provider == "s3"
        && (connection.bucket.trim().is_empty() || connection.region.trim().is_empty())
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    let old = secrets
        .connections
        .get(connection_id)
        .cloned()
        .unwrap_or_default();
    // A provider change must not carry the other provider's fields.
    let old = if existing.provider == connection.provider {
        old
    } else {
        Credentials::default()
    };
    let credentials = credentials.merge(&old);
    validate_credentials(&connection.provider, &credentials)?;
    let changed = connection != existing;
    let vaults = store
        .vaults
        .values()
        .filter(|binding| binding.connection_id == connection_id)
        .count();
    store
        .connections
        .insert(connection_id.to_string(), connection);
    secrets
        .connections
        .insert(connection_id.to_string(), credentials);
    if remote_changed {
        for binding in store
            .vaults
            .values()
            .filter(|binding| binding.connection_id == connection_id)
        {
            let root = Path::new(&binding.root);
            let _ = std::fs::remove_file(paths.base_for(root, Some(binding)));
            let _ = std::fs::remove_file(paths.last(root));
        }
    }
    write_state(paths, &store, &secrets)?;
    Ok(serde_json::json!({ "changed": changed, "vaults": vaults }).to_string())
}

/// Every vault and the repository string it writes to. The settings page
/// uses this to answer "which remote folder is this library?".
pub fn vault_list(app: &tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let (store, _) = read_state(&store_paths(app)?)?;
    let mut list: Vec<serde_json::Value> = store
        .vaults
        .values()
        .map(|binding| {
            let connection = store.connections.get(&binding.connection_id);
            serde_json::json!({
                "root": binding.root,
                "name": Path::new(&binding.root)
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| binding.root.clone()),
                "connectionId": binding.connection_id,
                "provider": connection.map(|connection| connection.provider.clone()).unwrap_or_default(),
                "endpoint": connection.map(|connection| connection.endpoint.clone()).unwrap_or_default(),
                "bucket": connection.map(|connection| connection.bucket.clone()).unwrap_or_default(),
                "prefix": binding.prefix,
            })
        })
        .collect();
    list.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(list)
}

pub(super) fn validate_connection(connection: &Connection) -> Result<(), String> {
    if !matches!(connection.provider.as_str(), "webdav" | "s3") {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if connection.endpoint.trim().is_empty()
        || (!connection.prefix.is_empty() && !relative_path(&connection.prefix))
        || !matches!(connection.s3_flavor.as_str(), "standard" | "oss" | "kodo")
    {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    if connection.provider == "s3" && connection.s3_flavor == "kodo" {
        if connection.region.trim().is_empty() {
            return Err(SyncError::new("regionRequired").to_string());
        }
        if textus_sync::kodo::upload_host(&connection.region).is_none() {
            return Err(SyncError::new("unsupportedRegion").to_string());
        }
    }
    Ok(())
}

pub(super) fn validate_credentials(provider: &str, credentials: &Credentials) -> Result<(), String> {
    if !credentials.has_for(provider) {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    Ok(())
}

pub fn settings_json(
    config: &Config,
    has_credentials: bool,
    has_encryption_password: bool,
    connections: &[serde_json::Value],
) -> serde_json::Value {
    serde_json::json!({
        "config": config,
        "hasCredentials": has_credentials,
        "hasEncryptionPassword": has_encryption_password,
        "connections": connections,
    })
}

