//! What a repository needs from a transport: read, write, delete, and an
//! atomic create. Keys are relative to the repository prefix (`v1/head.json`,
//! `v1/blocks/ab/…`); each transport adds its own prefix and addressing.

use crate::error::{Result, SyncError};
use async_trait::async_trait;
use std::collections::BTreeMap;
use std::sync::Mutex;

#[async_trait]
pub trait ObjectStore: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;
    async fn has(&self, key: &str) -> Result<bool>;
    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()>;
    /// True when this call created the object; false when it already existed.
    /// A service that cannot refuse the second write must say so through the
    /// probe, not silently overwrite.
    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool>;
    async fn delete(&self, key: &str) -> Result<()>;
}

/// A store for tests and for a first run with no network: one map, with the
/// same create semantics the transports must provide.
#[derive(Default)]
pub struct MemoryStore {
    objects: Mutex<BTreeMap<String, Vec<u8>>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn keys(&self) -> Vec<String> {
        self.objects
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .cloned()
            .collect()
    }
}

#[async_trait]
impl ObjectStore for MemoryStore {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .objects
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(key)
            .cloned())
    }

    async fn has(&self, key: &str) -> Result<bool> {
        Ok(self
            .objects
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(key))
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        self.objects
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(key.to_string(), bytes);
        Ok(())
    }

    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        let mut objects = self.objects.lock().unwrap_or_else(|e| e.into_inner());
        if objects.contains_key(key) {
            return Ok(false);
        }
        objects.insert(key.to_string(), bytes);
        Ok(true)
    }

    async fn delete(&self, key: &str) -> Result<()> {
        self.objects
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(key);
        Ok(())
    }
}

/// The probe every transport runs before a folder is trusted: create twice,
/// read back the first bytes, delete. A service that overwrites on the
/// second create is not safe for the remote lock.
pub async fn probe(store: &dyn ObjectStore) -> Result<()> {
    let key = format!("v1/probes/{}", uuid::Uuid::new_v4());
    let first = vec![7u8; 32];
    let created = store.create(&key, first.clone()).await?;
    if !created {
        return Err(SyncError::new("unsafeServer"));
    }
    let outcome = async {
        if store.create(&key, vec![9u8; 32]).await? {
            return Err(SyncError::new("unsafeServer"));
        }
        let read = store.get(&key).await?;
        if read.as_deref() != Some(first.as_slice()) {
            return Err(SyncError::new("unsafeServer"));
        }
        Ok(())
    }
    .await;
    let _ = store.delete(&key).await;
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn memory_store_has_atomic_create() {
        let store = MemoryStore::new();
        assert!(store.create("a", b"one".to_vec()).await.unwrap());
        assert!(!store.create("a", b"two".to_vec()).await.unwrap());
        assert_eq!(store.get("a").await.unwrap().unwrap(), b"one");
        store.put("a", b"three".to_vec()).await.unwrap();
        assert_eq!(store.get("a").await.unwrap().unwrap(), b"three");
        store.delete("a").await.unwrap();
        assert!(!store.has("a").await.unwrap());
    }

    #[tokio::test]
    async fn probe_refuses_a_store_that_overwrites() {
        struct Overwriter(MemoryStore);
        #[async_trait]
        impl ObjectStore for Overwriter {
            async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
                self.0.get(key).await
            }
            async fn has(&self, key: &str) -> Result<bool> {
                self.0.has(key).await
            }
            async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
                self.0.put(key, bytes).await
            }
            async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
                self.0.put(key, bytes).await?;
                Ok(true)
            }
            async fn delete(&self, key: &str) -> Result<()> {
                self.0.delete(key).await
            }
        }
        let store = Overwriter(MemoryStore::new());
        assert_eq!(probe(&store).await.unwrap_err().code, "unsafeServer");
    }
}
