//! An `ObjectStore` whose metadata and blocks are sealed and whose object
//! names are HMACs. The plaintext descriptor at `v1/head.json` is the only
//! readable object, so old clients fail closed.

use crate::chunk::hash_hex;
use crate::encryption::{self, Cipher, EncryptionMetadata, Unlocked};
use crate::error::{Result, SyncError};
use crate::protocol::{HEAD_KEY, HISTORY_KEY, LOCK_KEY};
use crate::store::{probe, ObjectStore};
use async_trait::async_trait;
use uuid::Uuid;

pub const ENCRYPTED_HEAD: &str = "v2/head.bin";

pub struct EncryptedStore {
    raw: Box<dyn ObjectStore>,
    cipher: Cipher,
    fingerprint: String,
}

impl EncryptedStore {
    fn new(raw: Box<dyn ObjectStore>, unlocked: Unlocked) -> Self {
        Self {
            raw,
            cipher: unlocked.cipher,
            fingerprint: unlocked.fingerprint,
        }
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    async fn verify_descriptor(&self) -> Result<()> {
        let descriptor = self
            .raw
            .get(HEAD_KEY)
            .await?
            .ok_or_else(|| SyncError::new("encryptionMetadataMissing"))?;
        let metadata = EncryptionMetadata::parse(&descriptor)?;
        if hash_hex(&metadata.bytes()?) != self.fingerprint {
            return Err(SyncError::new("encryptionChanged"));
        }
        Ok(())
    }

    fn physical(&self, key: &str) -> Result<String> {
        if key == LOCK_KEY {
            return Ok(LOCK_KEY.to_string());
        }
        if key == HEAD_KEY {
            return Ok(ENCRYPTED_HEAD.to_string());
        }
        if key == HISTORY_KEY {
            return Ok("v2/history.bin".to_string());
        }
        if let Some(rest) = key.strip_prefix("v1/blocks/") {
            let mut parts = rest.split('/');
            let shard = parts.next().unwrap_or_default();
            let hash = parts.next().unwrap_or_default();
            if parts.next().is_some() || shard.len() != 2 || !is_hex(shard, 2) || !is_hex(hash, 64)
            {
                return Err(SyncError::new("invalidPath"));
            }
            let name = self.cipher.name(key)?;
            return Ok(format!("v2/blocks/{}/{}", &name[..2], name));
        }
        if let Some(rest) = key.strip_prefix("v1/snapshots/") {
            let revision = rest
                .strip_suffix(".json")
                .ok_or_else(|| SyncError::new("invalidPath"))?;
            Uuid::parse_str(revision).map_err(|_| SyncError::new("invalidPath"))?;
            return Ok(format!("v2/snapshots/{revision}.bin"));
        }
        if let Some(revision) = key.strip_prefix("v1/probes/") {
            Uuid::parse_str(revision).map_err(|_| SyncError::new("invalidPath"))?;
            return Ok(format!("v2/probes/{revision}.bin"));
        }
        if let Some(rest) = key.strip_prefix("v1/pending/") {
            let revision = rest
                .strip_suffix(".json")
                .ok_or_else(|| SyncError::new("invalidPath"))?;
            Uuid::parse_str(revision).map_err(|_| SyncError::new("invalidPath"))?;
            return Ok(format!("v2/pending/{revision}.bin"));
        }
        Err(SyncError::new("invalidPath"))
    }
}

fn is_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[async_trait]
impl ObjectStore for EncryptedStore {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        if key == HEAD_KEY {
            self.verify_descriptor().await?;
        }
        let physical = self.physical(key)?;
        let Some(bytes) = self.raw.get(&physical).await? else {
            return Ok(None);
        };
        if key == LOCK_KEY {
            Ok(Some(bytes))
        } else {
            self.cipher.open(key, &bytes).map(Some)
        }
    }

    async fn has(&self, key: &str) -> Result<bool> {
        self.raw.has(&self.physical(key)?).await
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        if key == LOCK_KEY {
            return Err(SyncError::new("invalidPath"));
        }
        if key == HEAD_KEY {
            self.verify_descriptor().await?;
        }
        let sealed = self.cipher.seal(key, &bytes)?;
        self.raw.put(&self.physical(key)?, sealed).await
    }

    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        if key == LOCK_KEY {
            return self.raw.create(LOCK_KEY, bytes).await;
        }
        let sealed = self.cipher.seal(key, &bytes)?;
        self.raw.create(&self.physical(key)?, sealed).await
    }

    async fn delete(&self, key: &str) -> Result<()> {
        self.raw.delete(&self.physical(key)?).await
    }
}

async fn own_lock(raw: &dyn ObjectStore, owner: &[u8]) -> Result<()> {
    if raw.get(LOCK_KEY).await?.as_deref() == Some(owner) {
        Ok(())
    } else {
        Err(SyncError::new("lockLost"))
    }
}

async fn release(raw: &dyn ObjectStore, owner: &[u8]) -> Result<bool> {
    if raw.get(LOCK_KEY).await?.as_deref() != Some(owner) {
        return Ok(false);
    }
    raw.delete(LOCK_KEY).await?;
    Ok(true)
}

/// Opens an existing encrypted repository, or initializes a new one after
/// proving the store respects conditional creates. The descriptor is
/// written under the lock and never falls back to a plaintext head.
pub async fn open_encrypted_store(
    raw: Box<dyn ObjectStore>,
    password: &str,
    pin: Option<&str>,
) -> Result<EncryptedStore> {
    encryption::validate_password(password)?;
    if let Some(descriptor) = raw.get(HEAD_KEY).await? {
        let unlocked = encryption::unlock(&descriptor, password, pin)?;
        return Ok(EncryptedStore::new(raw, unlocked));
    }
    if pin.is_some() || raw.has(ENCRYPTED_HEAD).await? {
        return Err(SyncError::new("encryptionMetadataMissing"));
    }
    probe(raw.as_ref()).await?;
    let owner = crate::protocol::Lock {
        id: Uuid::new_v4().to_string(),
        started_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
    .to_json()?;
    if !raw.create(LOCK_KEY, owner.clone()).await? {
        return Err(SyncError::new("locked"));
    }
    let outcome = initialize(raw.as_ref(), password, pin, &owner).await;
    match outcome {
        Ok(unlocked) => {
            if !release(raw.as_ref(), &owner).await? {
                return Err(SyncError::new("unlockFailed"));
            }
            Ok(EncryptedStore::new(raw, unlocked))
        }
        Err(error) => {
            let _ = release(raw.as_ref(), &owner).await;
            Err(error)
        }
    }
}

async fn initialize(
    raw: &dyn ObjectStore,
    password: &str,
    pin: Option<&str>,
    owner: &[u8],
) -> Result<Unlocked> {
    own_lock(raw, owner).await?;
    if let Some(descriptor) = raw.get(HEAD_KEY).await? {
        return encryption::unlock(&descriptor, password, pin);
    }
    let unlocked = encryption::new_encryption(password)?;
    own_lock(raw, owner).await?;
    if !raw.create(HEAD_KEY, unlocked.metadata.bytes()?).await? {
        return Err(SyncError::new("lockLost"));
    }
    let written = raw
        .get(HEAD_KEY)
        .await?
        .ok_or_else(|| SyncError::new("encryptionMetadataMissing"))?;
    encryption::unlock(&written, password, Some(&unlocked.fingerprint))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local::MemoryLocal;
    use crate::store::MemoryStore;
    use crate::{sync, Base, LocalFiles, SyncOptions};
    use std::sync::Arc;

    struct Shared(Arc<MemoryStore>);

    #[async_trait]
    impl ObjectStore for Shared {
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
            self.0.create(key, bytes).await
        }
        async fn delete(&self, key: &str) -> Result<()> {
            self.0.delete(key).await
        }
    }

    fn password() -> &'static str {
        "correct horse battery"
    }

    #[tokio::test]
    async fn a_new_repository_seals_its_head_and_blocks() {
        let raw = Box::new(MemoryStore::new());
        let store = open_encrypted_store(raw, password(), None).await.unwrap();
        store.put(HEAD_KEY, b"head".to_vec()).await.unwrap();
        assert_eq!(store.get(HEAD_KEY).await.unwrap(), Some(b"head".to_vec()));
        let block = format!("v1/blocks/ab/{}", "ab".repeat(32));
        store.put(&block, b"block".to_vec()).await.unwrap();
        assert_eq!(store.get(&block).await.unwrap(), Some(b"block".to_vec()));
        assert!(store.raw.has(HEAD_KEY).await.unwrap());
        assert!(store.raw.has(ENCRYPTED_HEAD).await.unwrap());
        assert!(store.has(HEAD_KEY).await.unwrap());
    }

    #[tokio::test]
    async fn a_reopened_repository_needs_the_same_password() {
        let raw = Box::new(MemoryStore::new());
        let store = open_encrypted_store(raw, password(), None).await.unwrap();
        store.put(HEAD_KEY, b"head".to_vec()).await.unwrap();
        // The descriptor lives at the raw v1 key and is plaintext metadata.
        let descriptor = store.raw.get(HEAD_KEY).await.unwrap().unwrap();
        assert_eq!(
            EncryptionMetadata::parse(&descriptor).unwrap().format,
            encryption::ENCRYPTION_FORMAT
        );
        let raw = store.raw;
        let error = open_encrypted_store(raw, "wrong password here", None).await;
        assert_eq!(error.err().unwrap().code, "invalidSyncPassword");
    }

    #[tokio::test]
    async fn the_lock_stays_plaintext_and_other_store_keys_do_not_work() {
        let raw = Box::new(MemoryStore::new());
        let store = open_encrypted_store(raw, password(), None).await.unwrap();
        assert!(store.create(LOCK_KEY, b"lock".to_vec()).await.unwrap());
        assert_eq!(store.get(LOCK_KEY).await.unwrap(), Some(b"lock".to_vec()));
        assert_eq!(
            store.put(LOCK_KEY, b"x".to_vec()).await.unwrap_err().code,
            "invalidPath"
        );
        assert!(store.get("v1/unknown").await.is_err());
    }

    #[test]
    fn physical_names_hide_the_plaintext_key() {
        let unlocked = encryption::new_encryption(password()).unwrap();
        let store = EncryptedStore::new(Box::new(MemoryStore::new()), unlocked);
        let key = format!("v1/blocks/ab/{}", "ab".repeat(32));
        let physical = store.physical(&key).unwrap();
        assert!(physical.starts_with("v2/blocks/"));
        assert!(!physical.contains(&key));
        assert_eq!(store.physical(HEAD_KEY).unwrap(), ENCRYPTED_HEAD);
        assert_eq!(store.physical(LOCK_KEY).unwrap(), LOCK_KEY);
    }

    #[tokio::test]
    async fn the_engine_syncs_over_an_encrypted_store() {
        let raw = Arc::new(MemoryStore::new());
        let first_store = open_encrypted_store(Box::new(Shared(raw.clone())), password(), None)
            .await
            .unwrap();
        let fingerprint = first_store.fingerprint().to_string();
        let first = MemoryLocal::new([("a.md".to_string(), b"one".to_vec())]);
        sync(
            &first_store,
            &first,
            SyncOptions {
                base: Base::empty(),
                device: "encrypted-a".to_string(),
                keep_days: 90,
                keep_chosen: false,
                allow_empty_scan: false,
                allow_bulk_delete: false,
            },
        )
        .await
        .unwrap();

        let second_store = open_encrypted_store(
            Box::new(Shared(raw.clone())),
            password(),
            Some(&fingerprint),
        )
        .await
        .unwrap();
        let second = MemoryLocal::new(Vec::new());
        sync(
            &second_store,
            &second,
            SyncOptions {
                base: Base::empty(),
                device: "encrypted-b".to_string(),
                keep_days: 90,
                keep_chosen: false,
                allow_empty_scan: false,
                allow_bulk_delete: false,
            },
        )
        .await
        .unwrap();
        assert_eq!(second.read("a.md").await.unwrap(), Some(b"one".to_vec()));
    }

    #[tokio::test]
    async fn a_document_id_never_reaches_the_plaintext_objects() {
        const ID: &str = "5f1c9a2e-4b7d-4c8a-9e3f-1a2b3c4d5e6f";
        let raw = Arc::new(MemoryStore::new());
        let store = open_encrypted_store(Box::new(Shared(raw.clone())), password(), None)
            .await
            .unwrap();
        let first = MemoryLocal::new([(
            "a.md".to_string(),
            format!(
                "---
textus_id: {ID}
---
one"
            )
            .into_bytes(),
        )]);
        sync(
            &store,
            &first,
            SyncOptions {
                base: Base::empty(),
                device: "encrypted-a".to_string(),
                keep_days: 90,
                keep_chosen: false,
                allow_empty_scan: false,
                allow_bulk_delete: false,
            },
        )
        .await
        .unwrap();

        let descriptor = raw.get(HEAD_KEY).await.unwrap().unwrap();
        assert!(!String::from_utf8_lossy(&descriptor).contains(ID));
        let sealed = raw.get(ENCRYPTED_HEAD).await.unwrap().unwrap();
        assert!(!String::from_utf8_lossy(&sealed).contains(ID));
    }
}
