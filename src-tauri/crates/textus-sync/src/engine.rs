//! One sync run: take the remote lock, read head/history, apply the
//! three-way plan, then publish snapshot → history → head and release the
//! lock. v1 only: no signing, no encryption, no background work.

use crate::chunk::{describe, hash_hex};
use crate::error::{Result, SyncError};
use crate::history::{fit, needs_publish, retire, thin};
use crate::local::LocalFiles;
use crate::path::{conflict_path, folded, in_scope};
use crate::planner::{moves, plan, Kind};
use crate::protocol::{
    block_key, new_revision, snapshot_key, Base, Entry, History, Keep, Lock, Manifest, Origin,
    HEAD_KEY, HISTORY_KEY, KEEP_DAYS, LOCK_KEY, MAX_HISTORY_SIZE, MAX_TRASH, TRASH_DAYS,
};
use crate::store::ObjectStore;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub struct SyncOptions {
    pub base: Base,
    pub device: String,
    pub keep_days: u32,
    /// Whether this device's keep setting replaces the folder's.
    pub keep_chosen: bool,
    /// A caller may bypass the two guards after asking the user.
    pub allow_empty_scan: bool,
    pub allow_bulk_delete: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPreview {
    pub uploaded: usize,
    pub downloaded: usize,
    pub removed_remote: usize,
    pub removed_local: usize,
    pub conflicts: usize,
    pub moved: usize,
    pub unchanged: usize,
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub empty_scan: bool,
    pub bulk_delete: bool,
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
    let owner = lock.to_json()?;
    // A 412 may arrive as an error rather than `false`; read the lock back
    // either way. Our own bytes (a retry after the create landed) are taken
    // over; anyone else's is respected.
    let created = match store.create(LOCK_KEY, owner.clone()).await {
        Ok(created) => created,
        Err(error) => {
            if !same_bytes(store.get(LOCK_KEY).await.ok().flatten(), &owner) {
                return Err(error);
            }
            true
        }
    };
    if !created && !same_bytes(store.get(LOCK_KEY).await?, &owner) {
        return Err(SyncError::new("locked"));
    }
    own_lock(store, &owner).await?;
    let outcome = run(store, local, &options, &owner).await;
    match outcome {
        Ok(outcome) => {
            if !release(store, &lock_id).await? {
                return Err(SyncError::new("lockLost"));
            }
            Ok(outcome)
        }
        Err(error) => {
            // A publish failure may have left a partially written remote:
            // keep the lock so the next run cannot plan over it. A lost
            // lock is not ours to release.
            if error.code != "publishFailed" && error.code != "lockLost" {
                let _ = release(store, &lock_id).await;
            }
            Err(error)
        }
    }
}

fn same_bytes(found: Option<Vec<u8>>, expected: &[u8]) -> bool {
    found.is_some_and(|found| found == expected)
}

/// Checks the remote lock still holds this run's exact bytes. Every write
/// that follows the first check is guarded, as another device may have
/// recovered the lock after a stall.
async fn own_lock(store: &dyn ObjectStore, owner: &[u8]) -> Result<()> {
    let Some(raw) = store.get(LOCK_KEY).await? else {
        return Err(SyncError::new("lockLost"));
    };
    if raw != owner {
        return Err(SyncError::new("lockLost"));
    }
    Ok(())
}

/// What a run would do, without writing anything. The first-connect
/// preview uses this to show transfers, conflicts and the two guards before
/// a user commits the connection.
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

#[path = "engine_preview.rs"]
mod preview;
pub use preview::preview;

#[path = "engine_run.rs"]
mod run;
use run::run;

#[path = "engine_identity.rs"]
mod identity_run;
use identity_run::{apply_renames, carry_history};

#[path = "engine_transfer.rs"]
mod transfer;
pub use transfer::read_entry;
