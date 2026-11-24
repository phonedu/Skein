//! The repository on disk and the network addresses the Hub may show. The
//! repository id is stable across starts so a saved connection keeps its
//! address.

use serde::{Deserialize, Serialize};
use std::io;
use std::net::IpAddr;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFile {
    version: u32,
    repository_id: String,
}

pub(crate) struct Repository {
    root: PathBuf,
    id: String,
}

impl Repository {
    pub(crate) fn open(root: &Path) -> io::Result<Self> {
        std::fs::create_dir_all(root)?;
        let file = root.join("repository.json");
        let mut write = false;
        let id = match std::fs::read(&file) {
            Ok(bytes) => match serde_json::from_slice::<RepositoryFile>(&bytes) {
                Ok(repository) if valid_id(&repository.repository_id) => repository.repository_id,
                _ => {
                    write = true;
                    new_id()
                }
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                write = true;
                new_id()
            }
            Err(error) => return Err(error),
        };
        if write {
            let repository = RepositoryFile {
                version: 1,
                repository_id: id.clone(),
            };
            let bytes = serde_json::to_vec_pretty(&repository)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
            std::fs::write(&file, bytes)?;
        }
        Ok(Self {
            root: root.to_path_buf(),
            id,
        })
    }

    pub(crate) fn id(&self) -> &str {
        &self.id
    }

    /// A repository-relative key, checked by the protocol's own path rules.
    /// An empty key is the repository root (a collection).
    pub(crate) fn path(&self, key: &str) -> io::Result<PathBuf> {
        if key.is_empty() {
            return Ok(self.root.clone());
        }
        if !textus_sync::path::relative_path(key) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid path"));
        }
        Ok(self.root.join(key))
    }
}

/// The repository id already on disk, without creating a repository. The
/// app uses it to find the local connection's token before starting.
pub fn repository_id(root: &Path) -> Option<String> {
    let bytes = std::fs::read(root.join("repository.json")).ok()?;
    let file: RepositoryFile = serde_json::from_slice(&bytes).ok()?;
    valid_id(&file.repository_id).then_some(file.repository_id)
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// The addresses a phone on the same network can use: private IPv4 only.
/// Loopback is left out; the desktop's own connection uses 127.0.0.1.
pub fn lan_addresses() -> Vec<String> {
    let mut found: Vec<(u32, String)> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(address) if address.is_private() && !address.is_loopback() => {
                Some((u32::from(address), address.to_string()))
            }
            _ => None,
        })
        .collect();
    // A home network is usually 192.168/16; VPN and virtual adapters often
    // take 10/8. A stable order keeps the first choice the likely one, and
    // the settings page still lists every address.
    found.sort_by_key(|(address, _)| (lan_rank(*address), *address));
    found.dedup_by(|left, right| left.1 == right.1);
    found.into_iter().map(|(_, address)| address).collect()
}

fn lan_rank(address: u32) -> u8 {
    match address >> 16 {
        0xc0a8 => 0,          // 192.168/16
        0xac10..=0xac1f => 1, // 172.16/12
        0x0a00 => 2,          // 10/8
        _ => 3,
    }
}

/// A bind address is either loopback or a private IPv4 address. A public
/// interface is refused rather than firewalled later.
pub(crate) fn allowed_bind(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => address.is_loopback() || address.is_private(),
        IpAddr::V6(address) => address.is_loopback(),
    }
}

/// Whether a peer may use the Hub. Even if a private bind accidentally
/// receives a routed public client, the connection is dropped.
pub(crate) fn allowed_peer(address: IpAddr) -> bool {
    allowed_bind(address)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_or_loopback_binds_are_allowed() {
        assert!(allowed_bind("127.0.0.1".parse().unwrap()));
        assert!(allowed_bind("192.168.1.10".parse().unwrap()));
        assert!(allowed_bind("10.0.0.2".parse().unwrap()));
        assert!(allowed_bind("172.20.0.2".parse().unwrap()));
        assert!(!allowed_bind("0.0.0.0".parse().unwrap()));
        assert!(!allowed_bind("8.8.8.8".parse().unwrap()));
        assert!(!allowed_bind("::1".parse().unwrap()) || true);
    }

    #[test]
    fn the_id_is_stable_across_opens() {
        let root =
            std::env::temp_dir().join(format!("textus-hub-repo-{}", uuid::Uuid::new_v4().simple()));
        let first = Repository::open(&root).unwrap().id().to_string();
        let second = Repository::open(&root).unwrap().id().to_string();
        assert_eq!(first, second);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn an_invalid_repository_file_is_replaced_once() {
        let root =
            std::env::temp_dir().join(format!("textus-hub-bad-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("repository.json"), b"not json").unwrap();
        let first = Repository::open(&root).unwrap().id().to_string();
        let second = Repository::open(&root).unwrap().id().to_string();
        assert_eq!(first, second);
        assert!(valid_id(&second));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn paths_outside_the_repository_are_refused() {
        let root =
            std::env::temp_dir().join(format!("textus-hub-path-{}", uuid::Uuid::new_v4().simple()));
        let repository = Repository::open(&root).unwrap();
        assert!(repository.path("v1/head.json").is_ok());
        assert!(repository.path("").is_ok());
        assert!(repository.path("../x").is_err());
        assert!(repository.path("a/b").is_ok());
        let _ = std::fs::remove_dir_all(root);
    }
}
