//! One sync run: take the remote lock, read head/history, apply the
//! three-way plan, then publish snapshot → history → head and release the
//! lock. v1 only: no signing, no encryption, no background work.

use crate::chunk::{describe, hash_hex};
use crate::error::{Result, SyncError};
use crate::local::LocalFiles;
use crate::path::{conflict_path, in_scope};
use crate::planner::{moves, plan, Kind};
use crate::protocol::{
    block_key, new_revision, snapshot_key, Base, Entry, History, Keep, Lock, Manifest, Origin,
    Version, HEAD_KEY, HISTORY_KEY, KEEP_DAYS, LOCK_KEY, MAX_VERSIONS,
};
use crate::store::ObjectStore;
use chrono::{SecondsFormat, Utc};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub struct SyncOptions {
    pub base: Base,
    pub device: String,
    pub keep_days: u32,
    /// A caller may bypass the two guards after asking the user.
    pub allow_empty_scan: bool,
    pub allow_bulk_delete: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
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
    if !store.create(LOCK_KEY, lock.to_json()?).await? {
        return Err(SyncError::new("locked"));
    }
    let outcome = run(store, local, &options).await;
    match outcome {
        Ok(outcome) => {
            if !release(store, &lock_id).await? {
                return Err(SyncError::new("lockLost"));
            }
            Ok(outcome)
        }
        Err(error) => {
            if error.code != "publishFailed" {
                let _ = release(store, &lock_id).await;
            }
            Err(error)
        }
    }
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
) -> Result<SyncOutcome> {
    let head = store
        .get(HEAD_KEY)
        .await?
        .map(|raw| Manifest::parse(&raw))
        .transpose()?;
    let remote_files = head
        .as_ref()
        .map(|head| head.files.clone())
        .unwrap_or_default();
    let history = history_for(store, head.as_ref()).await?;
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

    let mut done = BTreeSet::new();
    for (to, from) in &moves {
        if local.move_file(from, to).await? {
            let hash = files
                .get(from)
                .map(|entry| entry.hash.clone())
                .unwrap_or_default();
            base.files.remove(from);
            base.files.insert(to.clone(), hash);
            done.insert(from.clone());
            done.insert(to.clone());
            result.moved += 1;
        }
    }

    let mut cache: BTreeMap<String, Vec<u8>> = BTreeMap::new();
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
                if local.remove(&action.path).await? {
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
                let bytes = download_entry(store, entry, &mut cache).await?;
                if local.apply(&action.path, bytes).await? {
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
                let bytes = download_entry(store, remote_entry, &mut cache).await?;
                let target = conflict_path(&action.path, &remote_entry.hash);
                if local.apply(&target, bytes).await? {
                    next.insert(target.clone(), remote_entry.clone());
                    base.files
                        .insert(action.path.clone(), local_entry.hash.clone());
                    base.files.insert(target.clone(), remote_entry.hash.clone());
                    result.conflicts.push(target);
                } else {
                    result.deferred.push(target);
                }
            }
        }
    }

    // Re-check every key before publishing: a bad plan must not delete data.
    for path in next.keys() {
        if !in_scope(path) {
            return Err(SyncError::new("invalidManifest"));
        }
    }
    let revision = new_revision();
    let updated_at = now();
    let snapshot = Manifest {
        format: crate::protocol::FORMAT.to_string(),
        revision: revision.clone(),
        updated_at: updated_at.clone(),
        files: next,
        trash: head
            .as_ref()
            .map(|head| head.trash.clone())
            .unwrap_or_default(),
    };
    let history_next = build_history(
        head.as_ref(),
        history.as_ref(),
        &snapshot,
        &updated_at,
        &options.device,
        options.keep_days,
    );

    let snapshot_json = snapshot.to_json()?;
    let history_json = history_next.to_json()?;
    store.put(&snapshot_key(&revision), snapshot_json).await?;
    store.put(HISTORY_KEY, history_json).await?;
    let publish_started = store.get(HEAD_KEY).await.is_ok();
    if let Err(error) = store.put(HEAD_KEY, snapshot.to_json()?).await {
        return Err(if publish_started {
            SyncError::new("publishFailed")
        } else {
            error
        });
    }
    let read_back = store
        .get(HEAD_KEY)
        .await?
        .ok_or_else(|| SyncError::new("publishFailed"))?;
    let read_back = Manifest::parse(&read_back)?;
    if read_back.revision != revision {
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
        if !store.has(&key).await? {
            store.put(&key, bytes[offset..end].to_vec()).await?;
        }
        offset = end;
    }
    if offset != bytes.len() || hash_hex(bytes) != entry.hash {
        return Err(SyncError::new("localChanged"));
    }
    Ok(())
}

async fn download_entry(
    store: &dyn ObjectStore,
    entry: &Entry,
    cache: &mut BTreeMap<String, Vec<u8>>,
) -> Result<Vec<u8>> {
    entry.validate()?;
    let mut out = Vec::with_capacity(entry.size as usize);
    for block in &entry.blocks {
        let bytes = if let Some(bytes) = cache.get(&block.hash) {
            bytes.clone()
        } else {
            let raw = store
                .get(&block_key(&block.hash))
                .await?
                .ok_or_else(|| SyncError::new("missingBlock"))?;
            if raw.len() as u64 != block.size || hash_hex(&raw) != block.hash {
                return Err(SyncError::new("missingBlock"));
            }
            cache.insert(block.hash.clone(), raw.clone());
            raw
        };
        out.extend_from_slice(&bytes);
    }
    if out.len() as u64 != entry.size || hash_hex(&out) != entry.hash {
        return Err(SyncError::new("missingBlock"));
    }
    Ok(out)
}

async fn history_for(store: &dyn ObjectStore, head: Option<&Manifest>) -> Result<Option<History>> {
    let Some(head) = head else {
        return Ok(None);
    };
    let Some(raw) = store.get(HISTORY_KEY).await? else {
        return Ok(None);
    };
    let Ok(history) = History::parse(&raw) else {
        return Ok(None);
    };
    if history.head.as_deref() == Some(head.revision.as_str()) {
        Ok(Some(history))
    } else {
        Ok(None)
    }
}

fn build_history(
    head: Option<&Manifest>,
    old: Option<&History>,
    next: &Manifest,
    now: &str,
    device: &str,
    keep_days: u32,
) -> History {
    let mut history = History::new(
        next.revision.clone(),
        head.map(|head| head.revision.clone()),
        Keep {
            days: if KEEP_DAYS.contains(&keep_days) {
                keep_days
            } else {
                90
            },
            at: now.to_string(),
        },
    );
    history.versions = old.map(|old| old.versions.clone()).unwrap_or_default();

    for (path, entry) in &next.files {
        let old_entry = head.and_then(|head| head.files.get(path));
        let old_origin = old.and_then(|old| old.current.get(path));
        let unchanged = old_entry.is_some_and(|old_entry| old_entry.hash == entry.hash);
        history.current.insert(
            path.clone(),
            Origin {
                at: if unchanged {
                    old_origin
                        .map(|origin| origin.at.clone())
                        .unwrap_or_else(|| now.to_string())
                } else {
                    now.to_string()
                },
                device: Some(
                    old_origin
                        .and_then(|origin| origin.device.clone())
                        .unwrap_or_else(|| device.to_string()),
                ),
            },
        );
    }

    if let Some(head) = head {
        let old_origin = old.map(|old| &old.current);
        for (path, entry) in &head.files {
            let changed = next
                .files
                .get(path)
                .is_none_or(|next_entry| next_entry.hash != entry.hash);
            if !changed {
                continue;
            }
            let origin = old_origin.and_then(|current| current.get(path));
            let version = Version {
                entry: entry.clone(),
                at: origin
                    .map(|origin| origin.at.clone())
                    .unwrap_or_else(|| head.updated_at.clone()),
                device: origin.and_then(|origin| origin.device.clone()),
                until: Some(now.to_string()),
            };
            let versions = history.versions.entry(path.clone()).or_default();
            versions.insert(0, version);
            versions.truncate(MAX_VERSIONS);
        }
    }
    history
}
