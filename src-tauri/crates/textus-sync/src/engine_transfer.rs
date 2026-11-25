//! Blocks in and out, and the conflict copy's name.

use super::*;
use crate::protocol::CHUNK_SIZE;
use std::collections::HashMap;

pub(super) async fn upload_blocks(
    store: &dyn ObjectStore,
    entry: &Entry,
    bytes: &[u8],
) -> Result<()> {
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

/// The blocks of the bytes already at this path, by hash. A changed file
/// usually keeps most of them, so a download only asks the remote for the
/// blocks that are actually missing.
fn local_blocks(bytes: &[u8]) -> HashMap<String, &[u8]> {
    let mut blocks = HashMap::new();
    for chunk in bytes.chunks(CHUNK_SIZE as usize) {
        blocks.entry(hash_hex(chunk)).or_insert(chunk);
    }
    blocks
}

/// `reuse` is the local version of the same path when there is one; its
/// blocks are taken as-is, with the remote asked only for the rest.
pub(super) async fn download_entry(
    store: &dyn ObjectStore,
    entry: &Entry,
    reuse: Option<&[u8]>,
) -> Result<Vec<u8>> {
    entry.validate()?;
    let known = reuse.map(local_blocks).unwrap_or_default();
    let mut out = Vec::with_capacity(entry.size as usize);
    for block in &entry.blocks {
        let bytes = match known
            .get(&block.hash)
            .filter(|chunk| chunk.len() as u64 == block.size)
        {
            Some(chunk) => chunk.to_vec(),
            None => store
                .get(&block_key(&block.hash))
                .await?
                .ok_or_else(|| SyncError::new("missingBlock"))?,
        };
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
    download_entry(store, entry, None).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunk::describe;
    use crate::protocol::block_key;
    use crate::store::MemoryStore;
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct CountingStore {
        inner: MemoryStore,
        gets: AtomicUsize,
    }

    impl CountingStore {
        fn new() -> Self {
            Self {
                inner: MemoryStore::new(),
                gets: AtomicUsize::new(0),
            }
        }

        fn gets(&self) -> usize {
            self.gets.load(Ordering::SeqCst)
        }

        fn reset(&self) {
            self.gets.store(0, Ordering::SeqCst);
        }
    }

    #[async_trait]
    impl ObjectStore for CountingStore {
        async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
            self.gets.fetch_add(1, Ordering::SeqCst);
            self.inner.get(key).await
        }

        async fn has(&self, key: &str) -> Result<bool> {
            self.inner.has(key).await
        }

        async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
            self.inner.put(key, bytes).await
        }

        async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
            self.inner.create(key, bytes).await
        }

        async fn delete(&self, key: &str) -> Result<()> {
            self.inner.delete(key).await
        }
    }

    #[tokio::test]
    async fn a_changed_file_only_gets_the_blocks_it_lacks() {
        let first = vec![1u8; CHUNK_SIZE as usize];
        let mut changed = vec![2u8; CHUNK_SIZE as usize];
        let tail = b"tail".to_vec();
        let old = [first.clone(), changed.clone(), tail.clone()].concat();
        changed[0] = 3;
        let new = [first, changed, tail].concat();
        let entry = describe(&new).unwrap();
        let store = CountingStore::new();
        let mut offset = 0;
        for block in &entry.blocks {
            let end = offset + block.size as usize;
            store
                .put(&block_key(&block.hash), new[offset..end].to_vec())
                .await
                .unwrap();
            offset = end;
        }

        let downloaded = download_entry(&store, &entry, Some(&old)).await.unwrap();
        assert_eq!(downloaded, new);
        assert_eq!(store.gets(), 1);

        store.reset();
        let full = download_entry(&store, &entry, None).await.unwrap();
        assert_eq!(full, new);
        assert_eq!(store.gets(), 3);
    }
}
