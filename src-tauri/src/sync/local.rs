//! One folder as `LocalFiles`: walk what the sync carries, read and write
//! files atomically, and hand deletions to the caller's trash.

use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use textus_sync::path::{descend, in_scope};
use textus_sync::protocol::{Entry, MAX_FILES, MAX_FILE_SIZE};
use textus_sync::{chunk::describe, LocalFiles, SyncError};

/// Where a file goes when this device deletes it: the system Trash on a
/// desktop, the app's trash on a phone. A failure stops the sync rather
/// than losing the file.
pub type TrashFile = Arc<dyn Fn(&Path) -> Result<(), String> + Send + Sync>;

pub struct LocalSync {
    root: PathBuf,
    trash: TrashFile,
    /// Files with a tab open: a sync never writes over them.
    open: Arc<dyn Fn(&Path) -> bool + Send + Sync>,
}

impl LocalSync {
    pub fn new(root: impl Into<PathBuf>, trash: TrashFile) -> Result<Self, String> {
        let root = root.into();
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        if !std::fs::metadata(&root)
            .map_err(|e| e.to_string())?
            .is_dir()
        {
            return Err(crate::errors::error("notFolder"));
        }
        Ok(Self {
            root,
            trash,
            open: Arc::new(|_| false),
        })
    }

    /// The same folder, with the paths an editor tab holds: those writes,
    /// removals and renames wait for the next run.
    pub fn with_open(self, open: Arc<dyn Fn(&Path) -> bool + Send + Sync>) -> Self {
        Self { open, ..self }
    }

    fn path(&self, relative: &str) -> Result<PathBuf, SyncError> {
        if !in_scope(relative) {
            return Err(SyncError::new("invalidPath"));
        }
        // No ancestor may be a link: a folder link would send a write out
        // of the repository, even though the relative path looks safe.
        let mut path = self.root.clone();
        let parts: Vec<&str> = relative.split('/').collect();
        for (index, part) in parts.iter().enumerate() {
            path.push(part);
            match std::fs::symlink_metadata(&path) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        return Err(SyncError::new("invalidPath"));
                    }
                    if index + 1 < parts.len() && !metadata.is_dir() {
                        return Err(SyncError::new("invalidPath"));
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(_) => return Err(SyncError::new("localReadError")),
            }
        }
        Ok(path)
    }
}

fn should_descend(relative: &str) -> bool {
    if relative == ".textus" || relative == ".obsidian" {
        return true;
    }
    if relative.starts_with(".textus/") {
        return relative
            .split('/')
            .skip(1)
            .all(|part| !part.starts_with('.'));
    }
    if relative.starts_with(".obsidian/") {
        return false;
    }
    descend(relative)
}

#[async_trait]
impl LocalFiles for LocalSync {
    async fn scan(&self) -> Result<std::collections::BTreeMap<String, Entry>, SyncError> {
        let mut files = std::collections::BTreeMap::new();
        let mut stack = vec![String::new()];
        while let Some(relative) = stack.pop() {
            let dir = if relative.is_empty() {
                self.root.clone()
            } else {
                self.root.join(&relative)
            };
            let mut entries = tokio::fs::read_dir(&dir)
                .await
                .map_err(|_| SyncError::new("localReadError"))?;
            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|_| SyncError::new("localReadError"))?
            {
                let name = entry.file_name().to_string_lossy().into_owned();
                let child = if relative.is_empty() {
                    name
                } else {
                    format!("{relative}/{name}")
                };
                let metadata = tokio::fs::symlink_metadata(entry.path())
                    .await
                    .map_err(|_| SyncError::new("localReadError"))?;
                if metadata.file_type().is_symlink() {
                    continue;
                }
                if metadata.is_dir() {
                    if should_descend(&child) {
                        stack.push(child);
                    }
                    continue;
                }
                if !metadata.is_file() || !in_scope(&child) {
                    continue;
                }
                if files.len() >= MAX_FILES {
                    return Err(SyncError::new("tooManyFiles"));
                }
                if metadata.len() > MAX_FILE_SIZE {
                    return Err(SyncError::with_args("tooLarge", [child]));
                }
                let bytes = tokio::fs::read(entry.path())
                    .await
                    .map_err(|_| SyncError::new("localReadError"))?;
                files.insert(child, describe(&bytes)?);
            }
        }
        Ok(files)
    }

    async fn read(&self, path: &str) -> Result<Option<Vec<u8>>, SyncError> {
        let path = self.path(path)?;
        let metadata = match tokio::fs::metadata(&path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(SyncError::new("localReadError")),
        };
        if metadata.len() > MAX_FILE_SIZE {
            return Err(SyncError::new("tooLarge"));
        }
        tokio::fs::read(&path)
            .await
            .map(Some)
            .map_err(|_| SyncError::new("localReadError"))
    }

    async fn apply(
        &self,
        path: &str,
        bytes: Vec<u8>,
        expected: Option<&str>,
    ) -> Result<bool, SyncError> {
        let target = self.path(path)?;
        let open = self.open.clone();
        let expected = expected.map(str::to_string);
        tokio::task::spawn_blocking(move || {
            if open(&target) {
                return Ok(false);
            }
            let current = match std::fs::read(&target) {
                Ok(current) => Some(textus_sync::chunk::hash_hex(&current)),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(_) => return Err(SyncError::new("localReadError")),
            };
            if current != expected {
                return Ok(false);
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| SyncError::new("localWriteError"))?;
            }
            if std::fs::symlink_metadata(&target)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err(SyncError::new("localWriteError"));
            }
            crate::atomic::write_sync(&target, bytes)
                .map_err(|_| SyncError::new("localWriteError"))?;
            Ok(true)
        })
        .await
        .map_err(|_| SyncError::new("localWriteError"))?
    }

    async fn remove(&self, path: &str, expected: &str) -> Result<bool, SyncError> {
        let target = self.path(path)?;
        let open = self.open.clone();
        let expected = expected.to_string();
        let trash = self.trash.clone();
        tokio::task::spawn_blocking(move || {
            if open(&target) {
                return Ok(false);
            }
            let current = match std::fs::read(&target) {
                Ok(current) => textus_sync::chunk::hash_hex(&current),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
                Err(_) => return Err(SyncError::new("localReadError")),
            };
            if current != expected {
                return Ok(false);
            }
            if std::fs::symlink_metadata(&target)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err(SyncError::new("localTrashError"));
            }
            trash(&target).map_err(|_| SyncError::new("localTrashError"))?;
            Ok(true)
        })
        .await
        .map_err(|_| SyncError::new("localTrashError"))?
    }

    async fn move_file(&self, from: &str, to: &str, expected: &str) -> Result<bool, SyncError> {
        let from = self.path(from)?;
        let to = self.path(to)?;
        let open = self.open.clone();
        let expected = expected.to_string();
        tokio::task::spawn_blocking(move || {
            if open(&from) || open(&to) {
                return Ok(false);
            }
            let current = match std::fs::read(&from) {
                Ok(current) => textus_sync::chunk::hash_hex(&current),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
                Err(_) => return Err(SyncError::new("localReadError")),
            };
            if current != expected || to.exists() {
                return Ok(false);
            }
            crate::atomic::move_entry(&from, &to).map_err(|_| SyncError::new("localMoveError"))?;
            Ok(true)
        })
        .await
        .map_err(|_| SyncError::new("localMoveError"))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn local(root: &Path) -> (LocalSync, Arc<Mutex<Vec<PathBuf>>>) {
        let trashed = Arc::new(Mutex::new(Vec::new()));
        let seen = trashed.clone();
        let trash_dir = root.join("trash");
        std::fs::create_dir_all(&trash_dir).unwrap();
        let trash: TrashFile = Arc::new(move |path: &Path| {
            let name = path.file_name().unwrap().to_owned();
            let target = trash_dir.join(name);
            std::fs::rename(path, &target).map_err(|e| e.to_string())?;
            seen.lock().unwrap().push(target);
            Ok(())
        });
        (LocalSync::new(root.to_path_buf(), trash).unwrap(), trashed)
    }

    #[tokio::test]
    async fn scan_follows_scope_and_skips_hidden_or_build_folders() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("Notes")).unwrap();
        std::fs::create_dir_all(dir.path().join("node_modules")).unwrap();
        std::fs::create_dir_all(dir.path().join(".textus/library")).unwrap();
        std::fs::write(dir.path().join("Notes/a.md"), b"a").unwrap();
        std::fs::write(dir.path().join("node_modules/x.md"), b"x").unwrap();
        std::fs::write(dir.path().join(".textus/library/b.md"), b"b").unwrap();
        std::fs::write(dir.path().join(".hidden.md"), b"h").unwrap();
        std::fs::write(dir.path().join("a.exe"), b"e").unwrap();

        let (local, _) = local(dir.path());
        let files = local.scan().await.unwrap();
        assert!(files.contains_key("Notes/a.md"));
        assert!(files.contains_key(".textus/library/b.md"));
        assert_eq!(files.len(), 2);
    }

    #[tokio::test]
    async fn writes_replace_and_removals_go_to_the_trash() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.md"), b"old").unwrap();
        let (local, trashed) = local(dir.path());

        assert!(local
            .apply(
                "a.md",
                b"new".to_vec(),
                Some(&textus_sync::chunk::hash_hex(b"old"))
            )
            .await
            .unwrap());
        assert_eq!(local.read("a.md").await.unwrap(), Some(b"new".to_vec()));
        assert!(local
            .remove("a.md", &textus_sync::chunk::hash_hex(b"new"))
            .await
            .unwrap());
        assert!(!dir.path().join("a.md").exists());
        assert_eq!(trashed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_move_never_goes_over_an_existing_name() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.md"), b"a").unwrap();
        std::fs::write(dir.path().join("b.md"), b"b").unwrap();
        let (local, _) = local(dir.path());
        assert!(!local
            .move_file("a.md", "b.md", &textus_sync::chunk::hash_hex(b"a"))
            .await
            .unwrap());
        assert!(local
            .move_file("a.md", "c.md", &textus_sync::chunk::hash_hex(b"a"))
            .await
            .unwrap());
        assert_eq!(local.read("c.md").await.unwrap(), Some(b"a".to_vec()));
    }
}
