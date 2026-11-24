//! Loading, saving and forking one vault's binding.

use super::*;

pub fn fork_vault(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    fork_at(&store_paths(app)?, root)
}

pub(super) fn fork_at(paths: &StorePaths, root: &Path) -> Result<(), String> {
    let (store, _) = read_state(paths)?;
    if store.vaults.contains_key(&root_key(root)) {
        return Err(SyncError::new("invalidConfig").to_string());
    }
    let id = Uuid::new_v4().simple().to_string();
    write_identity_file(root, &id);
    Ok(())
}

/// The binding for `root`: its own, or the one whose folder this is after
/// a move (the old folder is gone, the identity file came along).
pub(super) fn resolved_binding(store: &StoreFile, root: &Path) -> Option<(String, Binding)> {
    let key = root_key(root);
    if let Some(binding) = store.vaults.get(&key) {
        if Path::new(&binding.root) == root {
            return Some((key, binding.clone()));
        }
    }
    let id = read_identity(root)?;
    store
        .vaults
        .iter()
        .find(|(_, binding)| binding.vault_id == id && !Path::new(&binding.root).exists())
        .map(|(key, binding)| (key.clone(), binding.clone()))
}

pub fn load_vault_secret(app: &tauri::AppHandle, vault_id: &str) -> Result<VaultSecret, String> {
    if vault_id.is_empty() {
        return Ok(VaultSecret::default());
    }
    let (_, secrets) = read_state(&store_paths(app)?)?;
    Ok(secrets.vaults.get(vault_id).cloned().unwrap_or_default())
}

pub fn save_vault_pin(app: &tauri::AppHandle, vault_id: &str, pin: &str) -> Result<(), String> {
    if vault_id.is_empty() {
        return Ok(());
    }
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let paths = store_paths(app)?;
    let (_, mut secrets) = read_state(&paths)?;
    secrets.vaults.entry(vault_id.to_string()).or_default().pin = pin.to_string();
    let json = serde_json::to_string(&secrets).map_err(|e| e.to_string())?;
    crate::atomic::write_secret_sync(&paths.secrets, json).map_err(|e| e.to_string())
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

pub(super) fn load_at(paths: &StorePaths, root: &Path) -> Result<Option<(Config, Credentials)>, String> {
    let (store, secrets) = read_state(paths)?;
    let Some((_, binding)) = resolved_binding(&store, root) else {
        return Ok(None);
    };
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
            encrypted: binding.encrypted,
            vault_id: binding.vault_id.clone(),
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

pub(super) fn save_at(
    paths: &StorePaths,
    root: &Path,
    config: Config,
    credentials: Credentials,
) -> Result<(), String> {
    let key = root_key(root);
    let (mut store, mut secrets) = read_state(paths)?;
    let mut existing = store.vaults.get(&key).cloned();
    // A folder that moved keeps its identity file; the old path is gone,
    // so follow the identity instead of treating it as a new vault.
    let moved_from = if existing.is_none() {
        resolved_binding(&store, root).map(|(old_key, binding)| {
            store.vaults.remove(&old_key);
            existing = Some(binding);
            old_key
        })
    } else {
        None
    };
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
    let sync_password = credentials.sync_password.clone();
    let mut connection_credentials = credentials;
    connection_credentials.sync_password.clear();
    let credentials = connection_credentials.merge(&old_credentials);
    validate_credentials(&connection.provider, &credentials)?;

    let vault_id = existing
        .as_ref()
        .map(|binding| binding.vault_id.clone())
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| vault_id(root));
    if existing.is_none()
        && store.vaults.iter().any(|(other, binding)| {
            other != &key && !binding.vault_id.is_empty() && binding.vault_id == vault_id
        })
    {
        // A copied folder carries the same .textus/sync-vault.json. Do not
        // quietly bind it to the original's identity; the page asks first.
        return Err(SyncError::new("vaultCopied").to_string());
    }
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
    let remote_changed = existing
        .as_ref()
        .is_some_and(|binding| binding.connection_id != connection_id || binding.prefix != prefix);
    let previous_secret = secrets.vaults.get(&vault_id).cloned().unwrap_or_default();
    let sync_password = if sync_password.is_empty() {
        previous_secret.sync_password
    } else {
        sync_password
    };
    if config.encrypted {
        textus_sync::encryption::validate_password(&sync_password)
            .map_err(|error| error.to_string())?;
    }
    let pin = if remote_changed || existing.is_none() {
        String::new()
    } else {
        previous_secret.pin
    };
    let repository_id = existing
        .as_ref()
        .map(|binding| binding.repository_id.clone())
        .filter(|id| !id.is_empty() && !remote_changed)
        .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
    let binding = Binding {
        root: root.to_string_lossy().into_owned(),
        connection_id: connection_id.clone(),
        prefix,
        vault_id: vault_id.clone(),
        repository_id,
        keep_days,
        keep_chosen,
        encrypted: config.encrypted,
    };
    let existing_base = existing
        .as_ref()
        .map(|old| paths.base_for(Path::new(&old.root), Some(old)));
    let new_base = paths.base_for(root, Some(&binding));
    if remote_changed {
        // A different remote repository: the old base would plan against
        // the wrong head.
        if let Some(old) = existing_base {
            let _ = std::fs::remove_file(old);
        }
        let _ = std::fs::remove_file(&new_base);
        let _ = std::fs::remove_file(paths.last(root));
    } else if let Some(old) = existing_base {
        if old != new_base && old.exists() && !new_base.exists() {
            let _ = std::fs::create_dir_all(paths.data.as_path());
            let _ = std::fs::rename(&old, &new_base);
        }
    }
    if moved_from.is_some() {
        let old_last = existing
            .as_ref()
            .map(|old| paths.last(Path::new(&old.root)))
            .filter(|old| *old != paths.last(root));
        if let Some(old_last) = old_last {
            if old_last.exists() && !paths.last(root).exists() {
                let _ = std::fs::rename(&old_last, paths.last(root));
            }
        }
    }

    write_identity(root, &binding.vault_id);
    store.connections.insert(connection_id.clone(), connection);
    store.vaults.insert(key, binding);
    secrets
        .connections
        .insert(connection_id.clone(), credentials);
    secrets
        .vaults
        .insert(vault_id.clone(), VaultSecret { sync_password, pin });
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


/// The credentials saved for a connection, if it exists. The LAN Hub uses
/// it to find the desktop's own token before starting the server.
pub fn connection_credentials(
    app: &tauri::AppHandle,
    connection_id: &str,
) -> Result<Option<Credentials>, String> {
    let (_, secrets) = read_state(&store_paths(app)?)?;
    Ok(secrets.connections.get(connection_id).cloned())
}

/// Creates or updates one connection without binding a vault to it. The Hub
/// section uses this for the desktop's own WebDAV connection; binding stays
/// a separate, explicit action.
pub fn save_connection(
    app: &tauri::AppHandle,
    connection_id: &str,
    config: &Config,
    credentials: &Credentials,
) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let paths = store_paths(app)?;
    let (mut store, mut secrets) = read_state(&paths)?;
    let existing = store.connections.get(connection_id).cloned();
    let mut connection = existing.clone().unwrap_or_else(|| Connection {
        id: connection_id.to_string(),
        provider: config.provider.clone(),
        endpoint: config.endpoint.clone(),
        bucket: String::new(),
        prefix: String::new(),
        region: String::new(),
        path_style: false,
        s3_flavor: s3_flavor(),
    });
    connection.provider = config.provider.clone();
    connection.endpoint = config.endpoint.clone();
    connection.bucket = config.bucket.clone();
    connection.region = config.region.clone();
    connection.path_style = config.path_style;
    connection.s3_flavor = config.s3_flavor.clone();
    connection.prefix = config.prefix.trim_matches('/').to_string();
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
    let mut merged = credentials.clone();
    merged.sync_password.clear();
    let credentials = merged.merge(&old);
    validate_credentials(&connection.provider, &credentials)?;
    let remote_changed = existing.as_ref().is_some_and(|old| old != &connection);
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
    write_state(&paths, &store, &secrets)
}

/// Binds a vault to a connection at the connection's root, with no prefix:
/// the desktop and a paired phone must write the same repository. This is
/// the Hub section's explicit "connect this vault" action; it is not part
/// of starting the server.
pub fn bind_connection(
    app: &tauri::AppHandle,
    root: &Path,
    connection_id: &str,
) -> Result<(), String> {
    let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let paths = store_paths(app)?;
    let (mut store, secrets) = read_state(&paths)?;
    let connection = store
        .connections
        .get(connection_id)
        .cloned()
        .ok_or_else(|| SyncError::new("notFound").to_string())?;
    let key = root_key(root);
    let existing = store.vaults.get(&key).cloned();
    let vault_id = existing
        .as_ref()
        .map(|binding| binding.vault_id.clone())
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| vault_id(root));
    if let Some(old) = &existing {
        let _ = std::fs::remove_file(paths.base_for(root, Some(old)));
    }
    let _ = std::fs::remove_file(paths.base(root));
    let _ = std::fs::remove_file(paths.last(root));
    store.vaults.insert(
        key,
        Binding {
            root: root.to_string_lossy().to_string(),
            connection_id: connection.id,
            prefix: String::new(),
            vault_id,
            repository_id: String::new(),
            keep_days: existing.as_ref().map(|binding| binding.keep_days).unwrap_or(90),
            keep_chosen: existing
                .as_ref()
                .is_some_and(|binding| binding.keep_chosen),
            encrypted: false,
        },
    );
    write_state(&paths, &store, &secrets)
}
