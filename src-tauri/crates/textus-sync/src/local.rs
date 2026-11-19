//! What a sync needs from the folder on this device, and an in-memory
//! implementation for protocol tests. The app's filesystem adapter sits
//! above this trait; the engine never touches a path directly.

use crate::chunk::describe;
use crate::error::{Result, SyncError};
use crate::protocol::Entry;
use async_trait::async_trait;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

#[async_trait]
pub trait LocalFiles: Send + Sync {
    async fn scan(&self) -> Result<BTreeMap<String, Entry>>;
    async fn read(&self, path: &str) -> Result<Option<Vec<u8>>>;
    /// Write the file; false when it is open and the write must wait.
    async fn apply(&self, path: &str, bytes: Vec<u8>) -> Result<bool>;
    /// Remove the file into the app's trash; false when it is open.
    async fn remove(&self, path: &str) -> Result<bool>;
    /// Rename an unchanged file; false when it is open.
    async fn move_file(&self, from: &str, to: &str) -> Result<bool>;
}

/// A folder in memory, with the deferral and trash behaviour the tests need.
#[derive(Default)]
pub struct MemoryLocal {
    files: Mutex<BTreeMap<String, Vec<u8>>>,
    deferred: Mutex<BTreeSet<String>>,
    trashed: Mutex<Vec<(String, Vec<u8>)>>,
}

impl MemoryLocal {
    pub fn new(files: impl IntoIterator<Item = (String, Vec<u8>)>) -> Self {
        Self {
            files: Mutex::new(files.into_iter().collect()),
            ..Self::default()
        }
    }

    pub fn files(&self) -> BTreeMap<String, Vec<u8>> {
        self.files.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn has(&self, path: &str) -> bool {
        self.files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(path)
    }

    pub fn trashed(&self) -> Vec<(String, Vec<u8>)> {
        self.trashed
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn defer(&self, path: &str) {
        self.deferred
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(path.to_string());
    }

    pub fn set(&self, path: &str, bytes: impl Into<Vec<u8>>) {
        self.files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(path.to_string(), bytes.into());
    }

    pub fn delete(&self, path: &str) {
        self.files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(path);
    }
}

fn deferred(set: &Mutex<BTreeSet<String>>, path: &str) -> bool {
    set.lock().unwrap_or_else(|e| e.into_inner()).contains(path)
}

#[async_trait]
impl LocalFiles for MemoryLocal {
    async fn scan(&self) -> Result<BTreeMap<String, Entry>> {
        let files = self.files.lock().unwrap_or_else(|e| e.into_inner());
        files
            .iter()
            .map(|(path, bytes)| Ok((path.clone(), describe(bytes)?)))
            .collect()
    }

    async fn read(&self, path: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(path)
            .cloned())
    }

    async fn apply(&self, path: &str, bytes: Vec<u8>) -> Result<bool> {
        if deferred(&self.deferred, path) {
            return Ok(false);
        }
        self.files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(path.to_string(), bytes);
        Ok(true)
    }

    async fn remove(&self, path: &str) -> Result<bool> {
        if deferred(&self.deferred, path) {
            return Ok(false);
        }
        let removed = self
            .files
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(path);
        if let Some(bytes) = removed {
            self.trashed
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push((path.to_string(), bytes));
        }
        Ok(true)
    }

    async fn move_file(&self, from: &str, to: &str) -> Result<bool> {
        if deferred(&self.deferred, from) || deferred(&self.deferred, to) {
            return Ok(false);
        }
        let mut files = self.files.lock().unwrap_or_else(|e| e.into_inner());
        if files.contains_key(to) {
            return Err(SyncError::new("localChanged"));
        }
        if let Some(bytes) = files.remove(from) {
            files.insert(to.to_string(), bytes);
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn scan_reads_what_the_folder_holds() {
        let local = MemoryLocal::new([("a.md".to_string(), b"ab".to_vec())]);
        let files = local.scan().await.unwrap();
        assert_eq!(files["a.md"].size, 2);
        assert_eq!(local.read("a.md").await.unwrap(), Some(b"ab".to_vec()));
    }

    #[tokio::test]
    async fn a_deferred_file_is_not_written_or_removed() {
        let local = MemoryLocal::new([("a.md".to_string(), b"ab".to_vec())]);
        local.defer("a.md");
        assert!(!local.apply("a.md", b"new".to_vec()).await.unwrap());
        assert!(!local.remove("a.md").await.unwrap());
        assert_eq!(local.read("a.md").await.unwrap(), Some(b"ab".to_vec()));
        assert!(local.trashed().is_empty());
    }
}
