//! Blocks in and out, and the conflict copy's name.

use super::*;

pub(super) async fn upload_blocks(store: &dyn ObjectStore, entry: &Entry, bytes: &[u8]) -> Result<()> {
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

pub(super) async fn download_entry(store: &dyn ObjectStore, entry: &Entry) -> Result<Vec<u8>> {
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
pub(super) async fn keep_remote(
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
pub(super) async fn skipped_head(
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
