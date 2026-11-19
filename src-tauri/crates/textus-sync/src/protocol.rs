//! The wire shapes of `textus-cloud-sync/1`: the same JSON the Cloud Sync
//! plugin reads and writes. Unknown top-level fields are ignored by serde,
//! as old clients do; entries and blocks are validated before use.

use crate::error::{Result, SyncError};
use crate::path::{folded, in_scope, relative_path};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use uuid::Uuid;

pub const FORMAT: &str = "textus-cloud-sync/1";
pub const CHUNK_SIZE: u64 = 2 * 1024 * 1024;
pub const MAX_FILE_SIZE: u64 = 128 * 1024 * 1024;
pub const MAX_BLOCKS_PER_FILE: usize = 64;
pub const MAX_FILES: usize = 20_000;
pub const MAX_MANIFEST_SIZE: usize = 8 * 1024 * 1024;
pub const MAX_HISTORY_SIZE: usize = 8 * 1024 * 1024;
pub const MAX_VERSIONS: usize = 200;
pub const KEEP_DAYS: [u32; 4] = [30, 90, 365, 0];
pub const HEAD_KEY: &str = "v1/head.json";
pub const HISTORY_KEY: &str = "v1/history.json";
pub const LOCK_KEY: &str = "v1/lock.json";

pub fn snapshot_key(revision: &str) -> String {
    format!("v1/snapshots/{revision}.json")
}

pub fn block_key(hash: &str) -> String {
    let shard = hash.get(..2).unwrap_or("00");
    format!("v1/blocks/{shard}/{hash}")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Block {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub hash: String,
    pub size: u64,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trashed {
    pub path: String,
    pub deleted_at: String,
    pub entry: Entry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub revision: String,
    pub updated_at: String,
    pub files: BTreeMap<String, Entry>,
    #[serde(default)]
    pub trash: Vec<Trashed>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Origin {
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    #[serde(flatten)]
    pub entry: Entry,
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Keep {
    pub days: u32,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub format: String,
    pub current: BTreeMap<String, Origin>,
    pub versions: BTreeMap<String, Vec<Version>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
    pub keep: Keep,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lock {
    pub id: String,
    pub started_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Base {
    pub format: String,
    pub files: BTreeMap<String, String>,
    #[serde(default)]
    pub parked: BTreeMap<String, String>,
}

pub fn new_revision() -> String {
    Uuid::new_v4().to_string()
}

pub fn valid_sha256(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

impl Entry {
    pub fn validate(&self) -> Result<()> {
        if !valid_sha256(&self.hash) || self.size > MAX_FILE_SIZE {
            return Err(SyncError::new("invalidEntry"));
        }
        if self.blocks.len() > MAX_BLOCKS_PER_FILE {
            return Err(SyncError::new("invalidEntry"));
        }
        let mut total = 0u64;
        for block in &self.blocks {
            if !valid_sha256(&block.hash) || block.size == 0 || block.size > CHUNK_SIZE {
                return Err(SyncError::new("invalidEntry"));
            }
            total = total
                .checked_add(block.size)
                .ok_or_else(|| SyncError::new("invalidEntry"))?;
        }
        if total != self.size {
            return Err(SyncError::new("invalidEntry"));
        }
        Ok(())
    }
}

impl Manifest {
    pub fn new(revision: String, updated_at: String, files: BTreeMap<String, Entry>) -> Self {
        Self {
            format: FORMAT.to_string(),
            revision,
            updated_at,
            files,
            trash: Vec::new(),
        }
    }

    pub fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() > MAX_MANIFEST_SIZE {
            return Err(SyncError::new("invalidManifest"));
        }
        let value: Self =
            serde_json::from_slice(raw).map_err(|_| SyncError::new("invalidManifest"))?;
        value
            .validate()
            .map_err(|_| SyncError::new("invalidManifest"))?;
        Ok(value)
    }

    pub fn validate(&self) -> Result<()> {
        if self.format != FORMAT || self.files.len() > MAX_FILES {
            return Err(SyncError::new("invalidManifest"));
        }
        let mut folded_paths = HashSet::new();
        for (path, entry) in &self.files {
            if !in_scope(path) || !folded_paths.insert(folded(path)) {
                return Err(SyncError::new("invalidManifest"));
            }
            entry.validate()?;
        }
        for trashed in &self.trash {
            if !in_scope(&trashed.path) {
                return Err(SyncError::new("invalidManifest"));
            }
            trashed.entry.validate()?;
        }
        Ok(())
    }

    pub fn to_json(&self) -> Result<Vec<u8>> {
        self.validate()?;
        serde_json::to_vec(self).map_err(|_| SyncError::new("invalidManifest"))
    }
}

impl History {
    pub fn new(head: String, previous: Option<String>, keep: Keep) -> Self {
        Self {
            format: FORMAT.to_string(),
            current: BTreeMap::new(),
            versions: BTreeMap::new(),
            previous,
            head: Some(head),
            keep,
        }
    }

    pub fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() > MAX_HISTORY_SIZE {
            return Err(SyncError::new("invalidHistory"));
        }
        let value: Self =
            serde_json::from_slice(raw).map_err(|_| SyncError::new("invalidHistory"))?;
        value
            .validate()
            .map_err(|_| SyncError::new("invalidHistory"))?;
        Ok(value)
    }

    pub fn validate(&self) -> Result<()> {
        if self.format != FORMAT || !KEEP_DAYS.contains(&self.keep.days) {
            return Err(SyncError::new("invalidHistory"));
        }
        for path in self.current.keys() {
            if !in_scope(path) {
                return Err(SyncError::new("invalidHistory"));
            }
        }
        for (path, versions) in &self.versions {
            if !in_scope(path) || versions.len() > MAX_VERSIONS {
                return Err(SyncError::new("invalidHistory"));
            }
            for version in versions {
                version.entry.validate()?;
            }
        }
        Ok(())
    }

    pub fn to_json(&self) -> Result<Vec<u8>> {
        self.validate()?;
        serde_json::to_vec(self).map_err(|_| SyncError::new("invalidHistory"))
    }
}

impl Lock {
    pub fn parse(raw: &[u8]) -> Result<Self> {
        let value: Self = serde_json::from_slice(raw).map_err(|_| SyncError::new("invalidLock"))?;
        if value.id.is_empty() || value.started_at.is_empty() {
            return Err(SyncError::new("invalidLock"));
        }
        Ok(value)
    }

    pub fn to_json(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|_| SyncError::new("invalidLock"))
    }
}

impl Base {
    pub fn empty() -> Self {
        Self {
            format: FORMAT.to_string(),
            files: BTreeMap::new(),
            parked: BTreeMap::new(),
        }
    }

    pub fn parse(raw: &[u8]) -> Result<Self> {
        let value: Self = serde_json::from_slice(raw).map_err(|_| SyncError::new("invalidBase"))?;
        if value.format != FORMAT {
            return Err(SyncError::new("invalidBase"));
        }
        for map in [&value.files, &value.parked] {
            for (path, hash) in map {
                if !in_scope(path) || !valid_sha256(hash) {
                    return Err(SyncError::new("invalidBase"));
                }
            }
        }
        Ok(value)
    }

    pub fn to_json(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|_| SyncError::new("invalidBase"))
    }
}

/// A key under the repository prefix, after checking it is relative.
pub fn object_key(prefix: &str, key: &str) -> Result<String> {
    let prefix = prefix.trim_matches('/');
    if !relative_path(key) {
        return Err(SyncError::new("invalidPath"));
    }
    if prefix.is_empty() {
        return Ok(key.to_string());
    }
    if !relative_path(prefix) {
        return Err(SyncError::new("invalidPrefix"));
    }
    Ok(format!("{prefix}/{key}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(hash: &str, size: u64, block: u64) -> Entry {
        Entry {
            hash: hash.to_string(),
            size,
            blocks: vec![Block {
                hash: hash.to_string(),
                size: block,
            }],
        }
    }

    const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn an_entry_must_add_up_and_stay_within_the_limits() {
        assert!(entry(HASH, 2, 2).validate().is_ok());
        assert!(entry(HASH, 2, 1).validate().is_err());
        assert!(entry(HASH, 0, 0).validate().is_err());
        let too_many = Entry {
            hash: HASH.to_string(),
            size: (CHUNK_SIZE + 1) * 65,
            blocks: vec![
                Block {
                    hash: HASH.to_string(),
                    size: CHUNK_SIZE,
                };
                65
            ],
        };
        assert!(too_many.validate().is_err());
    }

    #[test]
    fn a_manifest_round_trips_and_rejects_bad_paths() {
        let mut files = BTreeMap::new();
        files.insert("Notes/a.md".to_string(), entry(HASH, 2, 2));
        let manifest = Manifest::new("r1".to_string(), "2026-11-19T00:00:00Z".to_string(), files);
        let raw = manifest.to_json().unwrap();
        assert_eq!(Manifest::parse(&raw).unwrap(), manifest);

        let mut bad = manifest.clone();
        bad.files
            .insert("node_modules/a.md".to_string(), entry(HASH, 2, 2));
        assert!(bad.to_json().is_err());
    }

    #[test]
    fn manifest_rejects_case_folded_twins() {
        let mut files = BTreeMap::new();
        files.insert("Notes/a.md".to_string(), entry(HASH, 2, 2));
        files.insert("notes/A.md".to_string(), entry(HASH, 2, 2));
        let manifest = Manifest::new("r".to_string(), "now".to_string(), files);
        assert!(manifest.to_json().is_err());
    }

    #[test]
    fn history_checks_keep_days_and_paths() {
        let mut history = History::new(
            "r".to_string(),
            None,
            Keep {
                days: 90,
                at: "now".to_string(),
            },
        );
        history.current.insert(
            "a.md".to_string(),
            Origin {
                at: "now".to_string(),
                device: Some("phone".to_string()),
            },
        );
        history.versions.insert(
            "a.md".to_string(),
            vec![Version {
                entry: entry(HASH, 2, 2),
                at: "before".to_string(),
                device: None,
                until: None,
            }],
        );
        assert!(History::parse(&history.to_json().unwrap()).is_ok());
        history.keep.days = 7;
        assert!(history.to_json().is_err());
    }

    #[test]
    fn object_keys_stay_under_the_prefix() {
        assert_eq!(
            object_key("vault", "v1/head.json").unwrap(),
            "vault/v1/head.json"
        );
        assert!(object_key("vault", "../head.json").is_err());
        assert!(object_key("", "v1/head.json").is_ok());
    }
}
