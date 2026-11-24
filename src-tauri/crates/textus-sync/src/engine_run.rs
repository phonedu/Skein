//! The run's transfer loop and its guards.

use super::transfer::*;
use super::*;
use std::time::Duration;

pub(super) async fn run(
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
    let mut remote_files = head
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
    let mut files: BTreeMap<String, Entry> = local
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

    let mut base = options.base.clone();
    let mut result = SyncResult::default();
    let renamed = apply_renames(store, local, &mut files, &mut remote_files, &mut base, &mut result).await?;

    let actions = plan(&files, &remote_files, &base.files);
    let moves = moves(&actions, &files, &remote_files, &base.files);
    let mut next = head
        .as_ref()
        .map(|head| head.files.clone())
        .unwrap_or_default();

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
                // A conflict copy must not keep the original's id: it is a
                // different document now. Give it a new id and upload its
                // changed bytes under that entry.
                let (bytes, copy_entry) = if local_entry.id.is_some() || remote_entry.id.is_some() {
                    let id = Uuid::new_v4().to_string();
                    let bytes = crate::identity::with_document_id(&bytes, &id)
                        .ok_or_else(|| SyncError::new("invalidEntry"))?;
                    let entry = describe(&bytes)?;
                    upload_blocks(store, &entry, &bytes).await?;
                    (bytes, entry)
                } else {
                    (bytes, remote_entry.clone())
                };
                let Some(target) = keep_remote(
                    local,
                    &next,
                    &mut names,
                    &action.path,
                    &copy_entry,
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
                next.insert(target.clone(), copy_entry.clone());
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
    // A run that wrote the history and died before its head left
    // `previous` equal to the head still there. Its retirement entries are
    // already in the history; fold them out before this run retires the
    // same files again, or each retry adds a duplicate version.
    if let (Some(head), Some(before)) = (head.as_ref(), before.as_ref()) {
        drop_pending_retirements(store, &mut history, before, head).await?;
    }

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

    // A rename moves the document's old versions to its new path too; the
    // old path keeps the same versions until keepDays thins them.
    for (from, to) in &renamed {
        carry_history(&mut history, from, to);
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
    // Shared once the head is written, whatever the write's answer says: a
    // failed write may still have landed, and a head that is ours is
    // success. The read-back can also fail transiently or see the previous
    // head for a moment (Qiniu's S3 endpoint did), so retry it briefly
    // before deciding the publish failed.
    let _ = store.put(HEAD_KEY, snapshot_json.clone()).await;
    let committed = published_head(store, &snapshot_json).await;
    if committed.as_deref() != Some(snapshot_json.as_slice()) {
        return Err(SyncError::new("publishFailed"));
    }
    result.revision = revision;
    Ok(SyncOutcome { result, base })
}

/// The head read-back after its write: up to three retries with a short
/// backoff. A lock is held here, so a different head is either a transient
/// old read or a lost lock; both need the same answer, not an immediate
/// `publishFailed` that strands the lock.
async fn published_head(store: &dyn ObjectStore, expected: &[u8]) -> Option<Vec<u8>> {
    const BACKOFF_MS: [u64; 3] = [100, 250, 500];
    let mut last = store.get(HEAD_KEY).await.ok().flatten();
    for delay in BACKOFF_MS {
        if last.as_deref() == Some(expected) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(delay)).await;
        last = store.get(HEAD_KEY).await.ok().flatten();
    }
    last
}

async fn drop_pending_retirements(
    store: &dyn ObjectStore,
    history: &mut History,
    before: &History,
    head: &Manifest,
) -> Result<()> {
    let Some(pending_revision) = before
        .head
        .as_deref()
        .filter(|revision| *revision != head.revision)
    else {
        return Ok(());
    };
    if before.previous.as_deref() != Some(head.revision.as_str()) {
        return Ok(());
    }
    let Some(raw) = store.get(&snapshot_key(pending_revision)).await? else {
        return Ok(());
    };
    let Ok(pending) = Manifest::parse(&raw) else {
        return Ok(());
    };
    for (path, entry) in &head.files {
        let changed = pending
            .files
            .get(path)
            .is_none_or(|next| next.hash != entry.hash);
        if !changed {
            continue;
        }
        let Some(versions) = history.versions.get_mut(path) else {
            continue;
        };
        versions.retain(|version| {
            !(version.entry.hash == entry.hash
                && version.until.as_deref() == Some(pending.updated_at.as_str()))
        });
        if versions.is_empty() {
            history.versions.remove(path);
        }
    }
    Ok(())
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
