//! One sync run: take the remote lock, read head/history, apply the
//! three-way plan, then publish snapshot → history → head and release the
//! lock. v1 only: no signing, no encryption, no background work.

use crate::chunk::{describe, hash_hex};
use crate::error::{Result, SyncError};
use crate::history::{fit, needs_publish, retire, thin};
use crate::local::LocalFiles;
use crate::path::{conflict_path, folded, in_scope};
use crate::planner::{moves, plan, Kind};
use crate::protocol::{
    block_key, new_revision, snapshot_key, Base, Entry, History, Keep, Lock, Manifest, Origin,
    HEAD_KEY, HISTORY_KEY, KEEP_DAYS, LOCK_KEY, MAX_HISTORY_SIZE, MAX_TRASH, TRASH_DAYS,
};
use crate::store::ObjectStore;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub struct SyncOptions {
    pub base: Base,
    pub device: String,
    pub keep_days: u32,
    /// Whether this device's keep setting replaces the folder's.
    pub keep_chosen: bool,
    /// A caller may bypass the two guards after asking the user.
    pub allow_empty_scan: bool,
    pub allow_bulk_delete: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub revision: String,
    pub uploaded: usize,
    pub downloaded: usize,
    pub removed: usize,
    pub moved: usize,
    pub conflicts: Vec<String>,
    pub deferred: Vec<String>,
    pub unchanged: usize,
}

#[derive(Debug)]
pub struct SyncOutcome {
    pub result: SyncResult,
    pub base: Base,
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub async fn sync(
    store: &dyn ObjectStore,
    local: &dyn LocalFiles,
    options: SyncOptions,
) -> Result<SyncOutcome> {
    let lock_id = Uuid::new_v4().to_string();
    let lock = Lock {
        id: lock_id.clone(),
        started_at: now(),
    };
    let owner = lock.to_json()?;
    // A 412 may arrive as an error rather than `false`; read the lock back
    // either way. Our own bytes (a retry after the create landed) are taken
    // over; anyone else's is respected.
    let created = match store.create(LOCK_KEY, owner.clone()).await {
        Ok(created) => created,
        Err(error) => {
            if !same_bytes(store.get(LOCK_KEY).await.ok().flatten(), &owner) {
                return Err(error);
            }
            true
        }
    };
    if !created && !same_bytes(store.get(LOCK_KEY).await?, &owner) {
        return Err(SyncError::new("locked"));
    }
    own_lock(store, &owner).await?;
    let outcome = run(store, local, &options, &owner).await;
    match outcome {
        Ok(outcome) => {
            if !release(store, &lock_id).await? {
                return Err(SyncError::new("lockLost"));
            }
            Ok(outcome)
        }
        Err(error) => {
            // A publish failure may have left a partially written remote:
            // keep the lock so the next run cannot plan over it. A lost
            // lock is not ours to release.
            if error.code != "publishFailed" && error.code != "lockLost" {
                let _ = release(store, &lock_id).await;
            }
            Err(error)
        }
    }
}

fn same_bytes(found: Option<Vec<u8>>, expected: &[u8]) -> bool {
    found.is_some_and(|found| found == expected)
}

/// Checks the remote lock still holds this run's exact bytes. Every write
/// that follows the first check is guarded, as another device may have
/// recovered the lock after a stall.
async fn own_lock(store: &dyn ObjectStore, owner: &[u8]) -> Result<()> {
    let Some(raw) = store.get(LOCK_KEY).await? else {
        return Err(SyncError::new("lockLost"));
    };
    if raw != owner {
        return Err(SyncError::new("lockLost"));
    }
    Ok(())
}

async fn release(store: &dyn ObjectStore, id: &str) -> Result<bool> {
    let Some(raw) = store.get(LOCK_KEY).await? else {
        return Ok(false);
    };
    let lock = Lock::parse(&raw)?;
    if lock.id != id {
        return Ok(false);
    }
    store.delete(LOCK_KEY).await?;
    Ok(true)
}

async fn run(
    store: &dyn ObjectStore,
    local: &dyn LocalFiles,
    options: &SyncOptions,
    owner: &[u8],
) -> Result<SyncOutcome> {
    let head = store
        .get(HEAD_KEY)
        .await?
        .map(|raw| Manifest::parse(&raw))
        .transpose()?;
    if head.is_none() && (!options.base.files.is_empty() || !options.base.parked.is_empty()) {
        // A synced folder keeps its base; an absent head is a missing or
        // emptied repository, not permission to delete every local file.
        return Err(SyncError::new("remoteMissing"));
    }
    let remote_files = head
        .as_ref()
        .map(|head| head.files.clone())
        .unwrap_or_default();
    // A corrupt history stops the run: starting a fresh one would drop
    // every version it holds. A missing one is a new folder.
    let before = match store.get(HISTORY_KEY).await? {
        Some(raw) => Some(History::parse(&raw)?),
        None => None,
    };
    // A head written since this history (by an older client, or by a run
    // that died between its history and head writes) is folded in first.
    let skipped = skipped_head(store, head.as_ref(), before.as_ref()).await?;
    let files: BTreeMap<String, Entry> = local
        .scan()
        .await?
        .into_iter()
        .filter(|(path, _)| in_scope(path))
        .collect();

    if !options.base.files.is_empty()
        && files.is_empty()
        && !remote_files.is_empty()
        && !options.allow_empty_scan
    {
        return Err(SyncError::with_args(
            "emptyScan",
            [remote_files.len().to_string()],
        ));
    }

    let actions = plan(&files, &remote_files, &options.base.files);
    let moves = moves(&actions, &files, &remote_files, &options.base.files);
    let mut next = head
        .as_ref()
        .map(|head| head.files.clone())
        .unwrap_or_default();
    let mut base = options.base.clone();
    let mut result = SyncResult::default();

    check_bulk(&actions, &files, &remote_files, options)?;

    // Twins that differ only in case cannot share a Windows or macOS
    // folder: refuse before any transfer, not after local writes.
    let mut names: BTreeMap<String, String> = remote_files
        .keys()
        .map(|path| (folded(path), path.clone()))
        .collect();
    for action in &actions {
        if names
            .get(&folded(&action.path))
            .is_some_and(|other| other != &action.path)
        {
            return Err(SyncError::new("caseCollision"));
        }
        names.insert(folded(&action.path), action.path.clone());
    }

    let mut done = BTreeSet::new();
    for (to, from) in &moves {
        let Some(entry) = files.get(from) else {
            continue;
        };
        if local.move_file(from, to, &entry.hash).await? {
            let hash = entry.hash.clone();
            base.files.remove(from);
            base.files.insert(to.clone(), hash);
            done.insert(from.clone());
            done.insert(to.clone());
            result.moved += 1;
        }
    }

    for action in &actions {
        if done.contains(&action.path) {
            continue;
        }
        match action.kind {
            Kind::Equal => {
                if let Some(entry) = files.get(&action.path) {
                    next.insert(action.path.clone(), entry.clone());
                    base.files.insert(action.path.clone(), entry.hash.clone());
                    result.unchanged += 1;
                }
            }
            Kind::Forget => {
                base.files.remove(&action.path);
            }
            Kind::DeleteRemote => {
                if next.remove(&action.path).is_some() {
                    base.files.remove(&action.path);
                    result.removed += 1;
                }
            }
            Kind::DeleteLocal => {
                let Some(entry) = files.get(&action.path) else {
                    continue;
                };
                if local.remove(&action.path, &entry.hash).await? {
                    next.remove(&action.path);
                    base.files.remove(&action.path);
                    result.removed += 1;
                } else {
                    result.deferred.push(action.path.clone());
                }
            }
            Kind::Upload => {
                let Some(entry) = files.get(&action.path) else {
                    continue;
                };
                let Some(bytes) = local.read(&action.path).await? else {
                    continue;
                };
                let found = describe(&bytes)?;
                if found != *entry {
                    return Err(SyncError::new("localChanged"));
                }
                upload_blocks(store, entry, &bytes).await?;
                next.insert(action.path.clone(), entry.clone());
                base.files.insert(action.path.clone(), entry.hash.clone());
                result.uploaded += 1;
            }
            Kind::Download => {
                let Some(entry) = remote_files.get(&action.path) else {
                    continue;
                };
                let bytes = download_entry(store, entry).await?;
                let expected = files.get(&action.path).map(|entry| entry.hash.as_str());
                if local.apply(&action.path, bytes, expected).await? {
                    next.insert(action.path.clone(), entry.clone());
                    base.files.insert(action.path.clone(), entry.hash.clone());
                    result.downloaded += 1;
                } else {
                    next.insert(action.path.clone(), entry.clone());
                    result.deferred.push(action.path.clone());
                }
            }
            Kind::Conflict => {
                let Some(local_entry) = files.get(&action.path) else {
                    continue;
                };
                let Some(remote_entry) = remote_files.get(&action.path) else {
                    continue;
                };
                let bytes = download_entry(store, remote_entry).await?;
                let Some(target) = keep_remote(
                    local,
                    &next,
                    &mut names,
                    &action.path,
                    remote_entry,
                    bytes.clone(),
                )
                .await?
                else {
                    result.deferred.push(action.path.clone());
                    continue;
                };
                // The local edit stays at the original path and is uploaded:
                // the conflict copy is the other device's version, not the
                // only surviving copy of this one.
                let Some(local_bytes) = local.read(&action.path).await? else {
                    return Err(SyncError::new("localChanged"));
                };
                if hash_hex(&local_bytes) != local_entry.hash {
                    return Err(SyncError::new("localChanged"));
                }
                upload_blocks(store, local_entry, &local_bytes).await?;
                next.insert(target.clone(), remote_entry.clone());
                next.insert(action.path.clone(), local_entry.clone());
                base.files
                    .insert(action.path.clone(), local_entry.hash.clone());
                base.files.insert(target.clone(), remote_entry.hash.clone());
                result.conflicts.push(target);
                result.uploaded += 1;
            }
        }
    }

    // Re-check every key before publishing: a bad plan must not delete data.
    for path in next.keys() {
        if !in_scope(path) {
            return Err(SyncError::new("invalidManifest"));
        }
    }

    let stamp = now();
    let now_ms = DateTime::parse_from_rfc3339(&stamp)
        .map(|at| at.timestamp_millis())
        .unwrap_or(0);
    // Deleted files from before 0.5 age out of the manifest.
    let mut trash = head
        .as_ref()
        .map(|head| head.trash.clone())
        .unwrap_or_default();
    trash.retain(|item| {
        DateTime::parse_from_rfc3339(&item.deleted_at)
            .map(|at| at.timestamp_millis() > now_ms - TRASH_DAYS * 86_400_000)
            .unwrap_or(false)
    });
    if trash.len() > MAX_TRASH {
        trash.drain(..trash.len() - MAX_TRASH);
    }
    let mut snapshot = Manifest {
        format: crate::protocol::FORMAT.to_string(),
        revision: String::new(),
        updated_at: String::new(),
        files: next,
        trash,
    };
    let changed = head
        .as_ref()
        .is_none_or(|head| head.files != snapshot.files || head.trash != snapshot.trash);
    let origin = Origin {
        at: stamp.clone(),
        device: Some(options.device.clone()),
    };

    let mut history = match (&skipped, head.as_ref(), before.as_ref()) {
        (Some(skipped), Some(head), Some(before)) => retire(before, skipped, head, &origin),
        _ => before.clone().unwrap_or_else(|| History {
            format: crate::protocol::FORMAT.to_string(),
            current: BTreeMap::new(),
            versions: BTreeMap::new(),
            previous: None,
            head: None,
            keep: Keep {
                days: 90,
                at: stamp.clone(),
            },
        }),
    };
    if changed {
        let empty;
        let remote = match head.as_ref() {
            Some(head) => head,
            None => {
                empty = Manifest::new(String::new(), String::new(), BTreeMap::new());
                &empty
            }
        };
        history = retire(&history, remote, &snapshot, &origin);
    }

    // A new choice is shared; otherwise the folder's existing one stays,
    // so a device that never touched the setting cannot reset another's.
    let chosen = options.keep_chosen || before.is_none();
    let keep = if chosen {
        Keep {
            days: if KEEP_DAYS.contains(&options.keep_days) {
                options.keep_days
            } else {
                90
            },
            at: stamp.clone(),
        }
    } else {
        before
            .as_ref()
            .map(|before| before.keep.clone())
            .unwrap_or(Keep {
                days: 90,
                at: stamp.clone(),
            })
    };
    let keep_moved = before.as_ref().is_none_or(|before| before.keep != keep);
    history.keep = keep;
    let mut dropped = thin(&mut history.versions, now_ms, history.keep.days);
    dropped.extend(fit(&mut history, MAX_HISTORY_SIZE)?);

    if !needs_publish(changed, skipped.is_some(), keep_moved, dropped.len()) {
        result.revision = head.map(|head| head.revision).unwrap_or_default();
        return Ok(SyncOutcome { result, base });
    }

    let revision = new_revision();
    snapshot.revision = revision.clone();
    snapshot.updated_at = stamp;
    history.previous = head
        .as_ref()
        .map(|head| head.revision.clone())
        .filter(|revision| !revision.is_empty());
    history.head = Some(revision.clone());
    let snapshot_json = snapshot.to_json()?;
    let history_json = history.to_json()?;

    // The snapshot and the history land before the shared head.
    own_lock(store, owner).await?;
    store
        .put(&snapshot_key(&revision), snapshot_json.clone())
        .await?;
    own_lock(store, owner).await?;
    store.put(HISTORY_KEY, history_json).await?;
    own_lock(store, owner).await?;
    store.put(HEAD_KEY, snapshot_json.clone()).await?;
    // Shared once the head is written, whatever the read-back says.
    let committed = store
        .get(HEAD_KEY)
        .await?
        .ok_or_else(|| SyncError::new("publishFailed"))?;
    if committed != snapshot_json {
        return Err(SyncError::new("publishFailed"));
    }
    result.revision = revision;
    Ok(SyncOutcome { result, base })
}

fn check_bulk(
    actions: &[crate::planner::Action],
    local: &BTreeMap<String, Entry>,
    remote: &BTreeMap<String, Entry>,
    options: &SyncOptions,
) -> Result<()> {
    if options.allow_bulk_delete {
        return Ok(());
    }
    let uploading: BTreeSet<&str> = actions
        .iter()
        .filter(|action| action.kind == Kind::Upload)
        .filter_map(|action| local.get(&action.path).map(|entry| entry.hash.as_str()))
        .collect();
    let downloading: BTreeSet<&str> = actions
        .iter()
        .filter(|action| action.kind == Kind::Download)
        .filter_map(|action| remote.get(&action.path).map(|entry| entry.hash.as_str()))
        .collect();
    let remote_deletes = actions
        .iter()
        .filter(|action| {
            action.kind == Kind::DeleteRemote
                && remote
                    .get(&action.path)
                    .is_some_and(|entry| !uploading.contains(entry.hash.as_str()))
        })
        .count();
    let local_deletes = actions
        .iter()
        .filter(|action| {
            action.kind == Kind::DeleteLocal
                && local
                    .get(&action.path)
                    .is_some_and(|entry| !downloading.contains(entry.hash.as_str()))
        })
        .count();
    let bulk =
        |total: usize, count: usize| count >= 2 && total > 0 && (count > 50 || count * 5 > total);
    if bulk(remote.len(), remote_deletes) || bulk(local.len(), local_deletes) {
        return Err(SyncError::with_args(
            "bulkDelete",
            [remote_deletes.to_string(), local_deletes.to_string()],
        ));
    }
    Ok(())
}

async fn upload_blocks(store: &dyn ObjectStore, entry: &Entry, bytes: &[u8]) -> Result<()> {
    let mut offset = 0usize;
    for block in &entry.blocks {
        let end = offset + block.size as usize;
        if end > bytes.len() || hash_hex(&bytes[offset..end]) != block.hash {
            return Err(SyncError::new("localChanged"));
        }
        let key = block_key(&block.hash);
        let chunk = bytes[offset..end].to_vec();
        if !store.has(&key).await? {
            store.put(&key, chunk.clone()).await?;
        }
        // A stored block's name alone is not proof of its contents.
        let stored = store
            .get(&key)
            .await?
            .ok_or_else(|| SyncError::new("integrityError"))?;
        if stored != chunk || hash_hex(&stored) != block.hash {
            return Err(SyncError::new("integrityError"));
        }
        offset = end;
    }
    if offset != bytes.len() || hash_hex(bytes) != entry.hash {
        return Err(SyncError::new("localChanged"));
    }
    Ok(())
}

async fn download_entry(store: &dyn ObjectStore, entry: &Entry) -> Result<Vec<u8>> {
    entry.validate()?;
    let mut out = Vec::with_capacity(entry.size as usize);
    for block in &entry.blocks {
        let bytes = store
            .get(&block_key(&block.hash))
            .await?
            .ok_or_else(|| SyncError::new("missingBlock"))?;
        if bytes.len() as u64 != block.size || hash_hex(&bytes) != block.hash {
            return Err(SyncError::new("missingBlock"));
        }
        out.extend_from_slice(&bytes);
    }
    if out.len() as u64 != entry.size || hash_hex(&out) != entry.hash {
        return Err(SyncError::new("missingBlock"));
    }
    Ok(out)
}

/// The bytes of one entry, for the history page's restore action: the same
/// block checks a download makes, with no local file involved.
pub async fn read_entry(store: &dyn ObjectStore, entry: &Entry) -> Result<Vec<u8>> {
    download_entry(store, entry).await
}

/// Writes another device's version beside the local one. A path already
/// holding different bytes (or another conflict of the same name) gets a
/// unique suffix, so a user's copy is never overwritten.
async fn keep_remote(
    local: &dyn LocalFiles,
    next: &BTreeMap<String, Entry>,
    names: &mut BTreeMap<String, String>,
    path: &str,
    entry: &Entry,
    bytes: Vec<u8>,
) -> Result<Option<String>> {
    let mut target = conflict_path(path, &entry.hash);
    for _ in 0..4 {
        let existing = local.read(&target).await?;
        let remote_collision = next
            .get(&target)
            .is_some_and(|other| other.hash != entry.hash);
        let name_collision = names
            .get(&folded(&target))
            .is_some_and(|other| other != &target);
        if remote_collision || name_collision {
            target = suffixed(&target);
            continue;
        }
        match existing {
            Some(existing) if hash_hex(&existing) == entry.hash => {
                names.insert(folded(&target), target.clone());
                return Ok(Some(target));
            }
            Some(_) => target = suffixed(&target),
            None => {
                if local.apply(&target, bytes, None).await? {
                    names.insert(folded(&target), target.clone());
                    return Ok(Some(target));
                }
                return Ok(None);
            }
        }
    }
    Err(SyncError::new("localChanged"))
}

fn suffixed(path: &str) -> String {
    let dot = path.rfind('.');
    let slash = path.rfind('/');
    let at = match dot {
        Some(dot) if Some(dot) > slash.map(|slash| slash + 1) => dot,
        _ => path.len(),
    };
    format!("{}-{}{}", &path[..at], Uuid::new_v4().simple(), &path[at..])
}

/// The head a corrupt or older history never saw: a run that wrote the
/// history and died before the head, or a client from before history.
/// Folding its snapshot in before the new one keeps those versions.
async fn skipped_head(
    store: &dyn ObjectStore,
    head: Option<&Manifest>,
    history: Option<&History>,
) -> Result<Option<Manifest>> {
    let (Some(head), Some(history)) = (head, history) else {
        return Ok(None);
    };
    let Some(before_head) = history.head.as_deref() else {
        return Ok(None);
    };
    if before_head == head.revision || history.previous.as_deref() == Some(&head.revision) {
        return Ok(None);
    }
    let Some(raw) = store.get(&snapshot_key(before_head)).await? else {
        return Ok(None);
    };
    // A snapshot that no longer parses cannot be folded in; the history it
    // belonged to is still better than starting over.
    Ok(Manifest::parse(&raw).ok())
}
