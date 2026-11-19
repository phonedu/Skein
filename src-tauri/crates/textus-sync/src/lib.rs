//! The Rust side of `textus-cloud-sync/1`: protocol shapes, path rules and
//! fixed-size chunking. No Tauri, no network and no app state here; the
//! app's adapter and the transports sit above this crate.

pub mod chunk;
pub mod engine;
pub mod error;
pub mod local;
pub mod path;
pub mod planner;
pub mod protocol;
pub mod s3;
pub mod store;
pub mod webdav;

pub use engine::{sync, SyncOptions, SyncOutcome, SyncResult};
pub use error::{Result, SyncError};
pub use local::{LocalFiles, MemoryLocal};
pub use planner::{plan, Action, Kind};
pub use protocol::{Base, Block, Entry, History, Keep, Lock, Manifest, Version};
pub use s3::S3Store;
pub use store::{probe, MemoryStore, ObjectStore};
pub use webdav::WebDavStore;
