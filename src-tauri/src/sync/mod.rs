//! The built-in sync's app-facing side: one folder on disk as the files the
//! protocol crate reads, and the command that runs it. Protocol, transport
//! and planning live in `crates/textus-sync`.

pub mod local;
pub mod plugin;
pub mod runners;
pub mod store;
