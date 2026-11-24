//! Pairing codes and device tokens. The code lives in memory only, is used
//! once and expires after ten minutes; only a token's SHA-256 is written.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PAIRING_MINUTES: u64 = 10;
/// Five wrong codes a minute from one address, then the address waits.
const ATTEMPTS_PER_MINUTE: usize = 5;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub read_only: bool,
    pub paired_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingInfo {
    pub code: String,
    pub read_only: bool,
    pub expires_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairError {
    InvalidCode,
    Expired,
    TooManyAttempts,
    Store,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRecord {
    id: String,
    name: String,
    token_hash: String,
    read_only: bool,
    paired_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthFile {
    version: u32,
    #[serde(default)]
    devices: Vec<DeviceRecord>,
}

struct Pairing {
    code: String,
    read_only: bool,
    expires_at: Instant,
    expires_at_text: String,
}

struct Inner {
    devices: Vec<DeviceRecord>,
    pairing: Option<Pairing>,
    attempts: HashMap<IpAddr, Vec<Instant>>,
}

pub(crate) struct Auth {
    path: PathBuf,
    inner: Mutex<Inner>,
}

impl Auth {
    pub(crate) fn load(path: &Path) -> io::Result<Self> {
        let devices = match std::fs::read(path) {
            Ok(bytes) => {
                serde_json::from_slice::<AuthFile>(&bytes)
                    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?
                    .devices
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error),
        };
        Ok(Self {
            path: path.to_path_buf(),
            inner: Mutex::new(Inner {
                devices,
                pairing: None,
                attempts: HashMap::new(),
            }),
        })
    }

    /// The desktop's own device. When the caller still has its token it is
    /// kept, so a connection made on a previous start keeps working; a new
    /// token is returned only when one was made.
    pub(crate) fn ensure_local(
        &self,
        token: Option<&str>,
    ) -> io::Result<(DeviceInfo, Option<String>)> {
        let mut inner = self.lock();
        if let Some(record) = inner.devices.iter().find(|device| device.id == "local") {
            if token.is_some_and(|token| hash_matches(&record.token_hash, token)) {
                return Ok((info(record), None));
            }
        }
        let token = new_token()?;
        let record = DeviceRecord {
            id: "local".to_string(),
            name: "This computer".to_string(),
            token_hash: hash_hex(&token),
            read_only: false,
            paired_at: now(),
        };
        inner.devices.retain(|device| device.id != "local");
        inner.devices.push(record.clone());
        self.save(&inner)?;
        Ok((info(&record), Some(token)))
    }

    pub(crate) fn new_code(&self, read_only: bool) -> io::Result<PairingInfo> {
        let code = new_code()?;
        let expires_at = Instant::now() + Duration::from_secs(PAIRING_MINUTES * 60);
        let expires_at_text = (Utc::now() + chrono::Duration::minutes(PAIRING_MINUTES as i64))
            .to_rfc3339_opts(SecondsFormat::Millis, true);
        let pairing = Pairing {
            code: code.clone(),
            read_only,
            expires_at,
            expires_at_text: expires_at_text.clone(),
        };
        let info = PairingInfo {
            code,
            read_only,
            expires_at: expires_at_text,
        };
        self.lock().pairing = Some(pairing);
        Ok(info)
    }

    pub(crate) fn current_code(&self) -> Option<PairingInfo> {
        let mut inner = self.lock();
        if inner
            .pairing
            .as_ref()
            .is_some_and(|pairing| pairing.expires_at <= Instant::now())
        {
            inner.pairing = None;
        }
        inner.pairing.as_ref().map(|pairing| PairingInfo {
            code: pairing.code.clone(),
            read_only: pairing.read_only,
            expires_at: pairing.expires_at_text.clone(),
        })
    }

    pub(crate) fn pair(
        &self,
        peer: IpAddr,
        code: &str,
        name: &str,
    ) -> Result<(DeviceInfo, String), PairError> {
        let mut inner = self.lock();
        let now = Instant::now();
        let attempts = inner.attempts.entry(peer).or_default();
        attempts.retain(|at| now.duration_since(*at) < Duration::from_secs(60));
        if attempts.len() >= ATTEMPTS_PER_MINUTE {
            return Err(PairError::TooManyAttempts);
        }
        attempts.push(now);

        let Some(pairing) = inner.pairing.as_ref() else {
            return Err(PairError::Expired);
        };
        if pairing.expires_at <= now {
            inner.pairing = None;
            return Err(PairError::Expired);
        }
        if !same_bytes(pairing.code.as_bytes(), code.as_bytes()) {
            return Err(PairError::InvalidCode);
        }
        let read_only = pairing.read_only;
        inner.pairing = None;

        let token = new_token().map_err(|_| PairError::Store)?;
        let record = DeviceRecord {
            id: uuid::Uuid::new_v4().simple().to_string(),
            name: clean_name(name),
            token_hash: hash_hex(&token),
            read_only,
            paired_at: now_text(),
        };
        inner.devices.push(record.clone());
        self.save(&inner).map_err(|_| PairError::Store)?;
        Ok((info(&record), token))
    }

    pub(crate) fn authorize(&self, id: &str, token: &str) -> Option<DeviceInfo> {
        let inner = self.lock();
        inner
            .devices
            .iter()
            .find(|device| device.id == id && hash_matches(&device.token_hash, token))
            .map(info)
    }

    pub(crate) fn devices(&self) -> Vec<DeviceInfo> {
        self.lock().devices.iter().map(info).collect()
    }

    /// Removes a paired device; the local device is not revocable here.
    pub(crate) fn revoke(&self, id: &str) -> io::Result<bool> {
        if id == "local" {
            return Ok(false);
        }
        let mut inner = self.lock();
        let before = inner.devices.len();
        inner.devices.retain(|device| device.id != id);
        if inner.devices.len() == before {
            return Ok(false);
        }
        self.save(&inner)?;
        Ok(true)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn save(&self, inner: &Inner) -> io::Result<()> {
        let file = AuthFile {
            version: 1,
            devices: inner.devices.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&file)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        write_private(&self.path, &bytes)
    }
}

fn info(record: &DeviceRecord) -> DeviceInfo {
    DeviceInfo {
        id: record.id.clone(),
        name: record.name.clone(),
        read_only: record.read_only,
        paired_at: record.paired_at.clone(),
    }
}

fn clean_name(name: &str) -> String {
    let name: String = name
        .trim()
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(80)
        .collect();
    if name.is_empty() {
        "device".to_string()
    } else {
        name
    }
}

fn new_code() -> io::Result<String> {
    let mut bytes = [0u8; 4];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    Ok(format!("{:06}", u32::from_le_bytes(bytes) % 1_000_000))
}

fn new_token() -> io::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn hash_hex(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hash_matches(hash: &str, token: &str) -> bool {
    same_bytes(hash.as_bytes(), hash_hex(token).as_bytes())
}

fn same_bytes(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut different = 0u8;
    for (left, right) in a.iter().zip(b) {
        different |= left ^ right;
    }
    different == 0
}

fn now() -> String {
    now_text()
}

fn now_text() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn write_private(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_file_name(format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("devices"),
        uuid::Uuid::new_v4().simple()
    ));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    use std::io::Write;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auth() -> (tempdir::TempDir, Auth) {
        let dir = tempdir::TempDir::new("textus-hub-auth").unwrap();
        let auth = Auth::load(&dir.path().join("devices.json")).unwrap();
        (dir, auth)
    }

    #[test]
    fn a_code_pairs_once_and_then_is_gone() {
        let (_dir, auth) = auth();
        let pairing = auth.new_code(false).unwrap();
        let (device, token) = auth
            .pair("127.0.0.1".parse().unwrap(), &pairing.code, "phone")
            .unwrap();
        assert_eq!(device.name, "phone");
        assert!(auth.authorize(&device.id, &token).is_some());
        assert_eq!(
            auth.pair("127.0.0.1".parse().unwrap(), &pairing.code, "again")
                .unwrap_err(),
            PairError::Expired
        );
    }

    #[test]
    fn five_wrong_codes_hold_the_address_for_a_minute() {
        let (_dir, auth) = auth();
        let pairing = auth.new_code(false).unwrap();
        let peer = "192.168.1.5".parse().unwrap();
        for _ in 0..ATTEMPTS_PER_MINUTE {
            assert_eq!(
                auth.pair(peer, "000000", "phone").unwrap_err(),
                PairError::InvalidCode
            );
        }
        assert_eq!(
            auth.pair(peer, &pairing.code, "phone").unwrap_err(),
            PairError::TooManyAttempts
        );
    }

    #[test]
    fn a_revoked_token_stops_working() {
        let (_dir, auth) = auth();
        let pairing = auth.new_code(false).unwrap();
        let (device, token) = auth
            .pair("127.0.0.1".parse().unwrap(), &pairing.code, "phone")
            .unwrap();
        assert!(auth.revoke(&device.id).unwrap());
        assert!(auth.authorize(&device.id, &token).is_none());
    }

    #[test]
    fn the_local_token_is_kept_when_the_caller_still_has_it() {
        let (_dir, auth) = auth();
        let (_, token) = auth.ensure_local(None).unwrap();
        let token = token.unwrap();
        let (device, again) = auth.ensure_local(Some(&token)).unwrap();
        assert_eq!(device.id, "local");
        assert!(again.is_none());
        let (_, replaced) = auth.ensure_local(Some("wrong")).unwrap();
        assert!(replaced.is_some());
    }

    #[test]
    fn only_the_hash_is_written() {
        let (dir, auth) = auth();
        let pairing = auth.new_code(false).unwrap();
        let (_, token) = auth
            .pair("127.0.0.1".parse().unwrap(), &pairing.code, "phone")
            .unwrap();
        let text = std::fs::read_to_string(dir.path().join("devices.json")).unwrap();
        assert!(!text.contains(&token));
        assert!(text.contains("tokenHash"));
    }
}

#[cfg(test)]
mod tempdir {
    use std::path::{Path, PathBuf};

    pub struct TempDir(PathBuf);

    impl TempDir {
        pub fn new(prefix: &str) -> std::io::Result<Self> {
            let path =
                std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4().simple()));
            std::fs::create_dir_all(&path)?;
            Ok(Self(path))
        }

        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}
