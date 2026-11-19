//! The Rust side of `textus-cloud-sync/1`: protocol shapes, path rules and
//! fixed-size chunking. No Tauri, no network and no app state here; the
//! app's adapter and the transports sit above this crate.

pub mod chunk;
pub mod error;
pub mod path;
pub mod protocol;

pub use error::{Result, SyncError};
pub use protocol::{Block, Entry, History, Keep, Lock, Manifest, Version};
