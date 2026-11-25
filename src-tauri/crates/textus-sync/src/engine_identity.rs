//! Document identity inside one run: stop on a fork, move a remote rename
//! at this device's old path, and carry the renamed document's history.

use super::transfer::*;
use super::*;
use crate::identity::{self, IdentityPair};

/// Applies the identity pairs a run found. Returns the `(from, to)` paths
/// whose history must follow the rename.
pub(super) async fn apply_renames(
    store: &dyn ObjectStore,
    local: &dyn LocalFiles,
    files: &mut BTreeMap<String, Entry>,
    remote_files: &mut BTreeMap<String, Entry>,
    base: &mut Base,
    result: &mut SyncResult,
) -> Result<Vec<(String, String)>> {
    let pairs = identity::pair(files, remote_files, &base.files);
    for pair in &pairs {
        match pair {
            IdentityPair::Fork {
                local: at_home,
                remote,
                ..
            } => {
                // A copy on either side gets a new id; one path keeps the
                // original. A path duplicated on both sides gets the same
                // new id in both places.
                let keep = remote
                    .iter()
                    .find(|path| base.files.contains_key(*path))
                    .cloned()
                    .or_else(|| {
                        at_home
                            .iter()
                            .find(|path| base.files.contains_key(*path))
                            .cloned()
                    })
                    .or_else(|| remote.first().cloned())
                    .or_else(|| at_home.first().cloned());
                let mut fresh: BTreeMap<String, String> = BTreeMap::new();
                for path in remote {
                    if Some(path) == keep.as_ref() {
                        continue;
                    }
                    let Some(entry) = remote_files.get(path).cloned() else {
                        continue;
                    };
                    let bytes = download_entry(store, &entry, None).await?;
                    let new_id = Uuid::new_v4().to_string();
                    let bytes = identity::with_document_id(&bytes, &new_id)
                        .ok_or_else(|| SyncError::new("invalidEntry"))?;
                    let next = describe(&bytes)?;
                    upload_blocks(store, &next, &bytes).await?;
                    remote_files.insert(path.clone(), next);
                    fresh.insert(path.clone(), new_id);
                    result.identity_reassigned.push(path.clone());
                }
                for path in at_home {
                    if Some(path) == keep.as_ref() {
                        continue;
                    }
                    let Some(entry) = files.get(path).cloned() else {
                        continue;
                    };
                    let Some(bytes) = local.read(path).await? else {
                        continue;
                    };
                    if crate::chunk::hash_hex(&bytes) != entry.hash {
                        return Err(SyncError::new("localChanged"));
                    }
                    let new_id = fresh
                        .get(path)
                        .cloned()
                        .unwrap_or_else(|| Uuid::new_v4().to_string());
                    let bytes = identity::with_document_id(&bytes, &new_id)
                        .ok_or_else(|| SyncError::new("invalidEntry"))?;
                    let next = describe(&bytes)?;
                    if !local.apply(path, bytes.clone(), Some(&entry.hash)).await? {
                        return Err(SyncError::new("localChanged"));
                    }
                    files.insert(path.clone(), next);
                    if !result.identity_reassigned.contains(path) {
                        result.identity_reassigned.push(path.clone());
                    }
                }
            }
            IdentityPair::Conflict { path, .. } => {
                let local_changed = files
                    .get(path)
                    .is_some_and(|entry| base.files.get(path) != Some(&entry.hash));
                let remote_changed = remote_files
                    .get(path)
                    .is_some_and(|entry| base.files.get(path) != Some(&entry.hash));
                // One side changed its id: that is a new identity, and the
                // unchanged side adopts it. Both changed is a real conflict.
                if local_changed && remote_changed {
                    return Err(SyncError::with_args("identityConflict", [path.clone()]));
                }
            }
            _ => {}
        }
    }

    let mut renamed = Vec::new();
    // A remote rename still at this device's old path: move the file here
    // before planning, so it is one document, not a delete plus a new one.
    for pair in &pairs {
        let IdentityPair::RemoteRename { from, to } = pair else {
            continue;
        };
        let Some(local_entry) = files.get(from).cloned() else {
            continue;
        };
        if files.contains_key(to) || base.files.contains_key(to) {
            continue;
        }
        let Some(base_hash) = base.files.get(from).cloned() else {
            continue;
        };
        let Some(remote_entry) = remote_files.get(to).cloned() else {
            continue;
        };
        let local_changed = local_entry.hash != base_hash;
        let remote_changed = remote_entry.hash != base_hash;
        // Both changed: leave the conflict path for now (Q4); a remote
        // rename whose other side did not change is a download at `to`.
        if local_changed && remote_changed {
            continue;
        }
        if !remote_changed && local.move_file(from, to, &local_entry.hash).await? {
            files.remove(from);
            files.insert(to.clone(), local_entry);
            base.files.remove(from);
            base.files.insert(to.clone(), base_hash);
            result.moved += 1;
            renamed.push((from.clone(), to.clone()));
        } else if remote_changed && !local_changed {
            renamed.push((from.clone(), to.clone()));
        }
    }
    for pair in &pairs {
        if let IdentityPair::LocalRename { from, to } = pair {
            renamed.push((from.clone(), to.clone()));
        }
    }
    Ok(renamed)
}

/// Copies a renamed document's current origin and versions to its new path.
/// The old path's records stay; they age out under the same keep rule.
pub(super) fn carry_history(history: &mut History, from: &str, to: &str) {
    if let Some(origin) = history.current.get(from).cloned() {
        history.current.entry(to.to_string()).or_insert(origin);
    }
    let Some(versions) = history.versions.get(from).cloned() else {
        return;
    };
    let target = history.versions.entry(to.to_string()).or_default();
    for version in versions {
        if !target
            .iter()
            .any(|kept| kept.entry.hash == version.entry.hash && kept.at == version.at)
        {
            target.push(version);
        }
    }
    target.sort_by_key(|version| std::cmp::Reverse(crate::history::retired_at(version)));
    target.truncate(crate::protocol::MAX_VERSIONS);
}
