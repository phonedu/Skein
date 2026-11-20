//! The app's own trash, for phones: no system Trash exists there, so a
//! deleted document or folder is moved into the app's private data with a
//! small record of where it came from. Desktop keeps the system Trash.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize)]
struct Record {
    id: String,
    /** The path it had. */
    original: String,
    /** The tree root it was under. */
    root: String,
    /** Its file or folder name. */
    name: String,
    is_dir: bool,
    deleted_at: String,
}

fn stamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!(
        "{}-{}",
        now.as_millis(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

/// The trash's folder in the app's private data, made if missing.
pub(crate) fn app_trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("trash");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Moves `target` into `trash_dir`, recording where it came from. The
/// original goes only after the copy is in place; a failed record leaves
/// the item in the trash rather than losing it.
pub(crate) fn move_to_trash(trash_dir: &Path, target: &Path, root: &Path) -> Result<(), String> {
    if !target.exists() {
        return Ok(());
    }
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical = target.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_root) || canonical == canonical_root {
        return Err(crate::errors::error("outsideDocuments"));
    }
    let meta = fs::symlink_metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err(format!("{} is a link; not moved.", canonical.display()));
    }
    let is_dir = meta.is_dir();
    let name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("{} has no name.", canonical.display()))?
        .to_string();
    let id = stamp();
    let home = trash_dir.join(&id);
    fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let kept = home.join(&name);
    let moved = match fs::rename(&canonical, &kept) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Another volume (app data and the user's folder often are):
            // copy first, then remove the original.
            copy_path(&canonical, &kept).and_then(|()| remove_path(&canonical))
        }
    };
    if let Err(e) = moved {
        let _ = fs::remove_dir_all(&home);
        return Err(e);
    }
    let record = Record {
        id,
        original: target.to_string_lossy().to_string(),
        root: root.to_string_lossy().to_string(),
        name,
        is_dir,
        deleted_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .to_string(),
    };
    let json = serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?;
    fs::write(home.join("record.json"), json).map_err(|e| e.to_string())
}

/// The phone's trash: the app's private folder, never the user's files.
pub(crate) fn to_app_trash(app: &AppHandle, target: &Path, root: &Path) -> Result<(), String> {
    move_to_trash(&app_trash_dir(app)?, target, root)
}

fn copy_path(from: &Path, to: &Path) -> Result<(), String> {
    if from.is_dir() {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_path(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ()).map_err(|e| e.to_string())
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("textus-trash-{name}-{}", stamp()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_a_file_and_keeps_its_record() {
        let root = scratch("root");
        let file = root.join("note.md");
        fs::write(&file, "rain").unwrap();
        let trash = scratch("bin");
        move_to_trash(&trash, &file, &root).unwrap();
        assert!(!file.exists());
        let entries: Vec<_> = fs::read_dir(&trash).unwrap().flatten().collect();
        assert_eq!(entries.len(), 1);
        let kept = entries[0].path();
        assert!(kept.join("note.md").exists());
        let record: serde_json::Value =
            serde_json::from_slice(&fs::read(kept.join("record.json")).unwrap()).unwrap();
        assert_eq!(record["original"], file.to_string_lossy().as_ref());
        assert_eq!(record["is_dir"], false);
        fs::remove_dir_all(&trash).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn moves_a_folder_and_refuses_the_root() {
        let root = scratch("root2");
        let folder = root.join("notes");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("a.md"), "a").unwrap();
        let trash = scratch("bin2");
        move_to_trash(&trash, &folder, &root).unwrap();
        assert!(!folder.exists());
        let entry = fs::read_dir(&trash).unwrap().flatten().next().unwrap();
        assert!(entry.path().join("notes/a.md").exists());
        assert!(move_to_trash(&trash, &root, &root).is_err());
        fs::remove_dir_all(&trash).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }
}
