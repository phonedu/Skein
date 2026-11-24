//! The LAN Hub: a WebDAV repository service for devices on the same private
//! network. Pairing hands out per-device tokens; the desktop may also use
//! the same service as its own WebDAV connection. No discovery, no TLS, no
//! public binding in v1.

mod auth;
mod server;
mod storage;

pub use auth::{DeviceInfo, PairError, PairingInfo};
pub use server::{Hub, HubConfig, HubError, HubStatus, StartedHub};
pub use storage::{lan_addresses, repository_id};

/// The port shown in the desktop settings page. A busy port is reported,
/// not silently replaced, so the address a phone was given keeps working.
pub const DEFAULT_PORT: u16 = 7419;
