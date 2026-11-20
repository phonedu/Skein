//! End-to-end encryption for a repository: the descriptor, key derivation,
//! object sealing and hashed object names, byte-compatible with the plugin's
//! `cloud-sync/encryption.ts`.

use crate::chunk::hash_hex;
use crate::error::{Result, SyncError};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

pub const ENCRYPTION_FORMAT: &str = "textus-cloud-sync-e2ee/1";
pub const KDF_ITERATIONS: u32 = 600_000;
const MAGIC: &[u8; 4] = b"TCS2";
const CHECK: &[u8] = b"Textus encrypted workspace key check";
const MAX_DESCRIPTOR: usize = 8192;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionHeader {
    pub format: String,
    pub repository_id: String,
    pub kdf: String,
    pub iterations: u32,
    pub salt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionMetadata {
    pub format: String,
    pub repository_id: String,
    pub kdf: String,
    pub iterations: u32,
    pub salt: String,
    pub verifier: String,
}

impl EncryptionMetadata {
    pub fn header(&self) -> EncryptionHeader {
        EncryptionHeader {
            format: self.format.clone(),
            repository_id: self.repository_id.clone(),
            kdf: self.kdf.clone(),
            iterations: self.iterations,
            salt: self.salt.clone(),
        }
    }

    /// The canonical bytes the plugin hashes for its descriptor pin and uses
    /// as the plaintext descriptor: field order is part of the format.
    pub fn bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|_| SyncError::new("invalidEncryptionMetadata"))
    }

    pub fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() > MAX_DESCRIPTOR {
            return Err(SyncError::new("invalidEncryptionMetadata"));
        }
        let value: serde_json::Value =
            serde_json::from_slice(raw).map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        if value.get("format").and_then(|format| format.as_str()) == Some(crate::protocol::FORMAT) {
            return Err(SyncError::new("legacyRemote"));
        }
        let metadata: Self = serde_json::from_value(value)
            .map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        if metadata.format != ENCRYPTION_FORMAT
            || metadata.kdf != "PBKDF2-SHA256"
            || metadata.iterations != KDF_ITERATIONS
        {
            return Err(SyncError::new("invalidEncryptionMetadata"));
        }
        let repository = Uuid::parse_str(&metadata.repository_id)
            .map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        if repository.to_string() != metadata.repository_id {
            return Err(SyncError::new("invalidEncryptionMetadata"));
        }
        if !is_hex(&metadata.salt, 64) || !is_hex(&metadata.verifier, (CHECK.len() + 32) * 2) {
            return Err(SyncError::new("invalidEncryptionMetadata"));
        }
        Ok(metadata)
    }
}

fn is_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn unhex(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .chunks(2)
        .map(|pair| {
            u8::from_str_radix(std::str::from_utf8(pair).unwrap_or_default(), 16).unwrap_or(0)
        })
        .collect()
}

/// Whether a remote head is an encryption descriptor, even a damaged one;
/// the caller then asks for a password instead of treating it as a plain
/// manifest.
pub fn is_encryption_descriptor(raw: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(raw)
        .ok()
        .and_then(|value| value.get("format")?.as_str().map(str::to_string))
        .is_some_and(|format| format.starts_with("textus-cloud-sync-e2ee/"))
}

pub fn validate_password(password: &str) -> Result<()> {
    let length = password.encode_utf16().count();
    if !(12..=1024).contains(&length) || password.trim().is_empty() {
        return Err(SyncError::new("syncPasswordRequired"));
    }
    Ok(())
}

pub struct Cipher {
    encryption_key: [u8; 32],
    name_key: [u8; 32],
    context: String,
}

impl Cipher {
    pub fn derive(password: &str, header: &EncryptionHeader) -> Result<Self> {
        validate_password(password)?;
        let mut master = [0u8; 32];
        pbkdf2_hmac::<Sha256>(
            password.as_bytes(),
            &unhex(&header.salt),
            KDF_ITERATIONS,
            &mut master,
        );
        let hkdf = Hkdf::<Sha256>::new(Some(header.repository_id.as_bytes()), &master);
        let mut encryption_key = [0u8; 32];
        let mut name_key = [0u8; 32];
        hkdf.expand(
            format!("{ENCRYPTION_FORMAT}/content").as_bytes(),
            &mut encryption_key,
        )
        .map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        hkdf.expand(
            format!("{ENCRYPTION_FORMAT}/names").as_bytes(),
            &mut name_key,
        )
        .map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        let context = serde_json::to_string(header)
            .map_err(|_| SyncError::new("invalidEncryptionMetadata"))?;
        Ok(Self {
            encryption_key,
            name_key,
            context,
        })
    }

    fn cipher(&self) -> Result<Aes256Gcm> {
        Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|_| SyncError::new("encryptedDataInvalid"))
    }

    pub fn seal(&self, key: &str, plain: &[u8]) -> Result<Vec<u8>> {
        if plain.len() > crate::protocol::MAX_MANIFEST_SIZE {
            return Err(SyncError::new("tooManyFiles"));
        }
        let mut iv = [0u8; 12];
        getrandom::getrandom(&mut iv).map_err(|_| SyncError::new("encryptedDataInvalid"))?;
        let aad = format!("{}\n{}", self.context, key);
        let body = self
            .cipher()?
            .encrypt(
                Nonce::from_slice(&iv),
                Payload {
                    msg: plain,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| SyncError::new("encryptedDataInvalid"))?;
        let mut out = Vec::with_capacity(16 + body.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&iv);
        out.extend_from_slice(&body);
        Ok(out)
    }

    pub fn open(&self, key: &str, encrypted: &[u8]) -> Result<Vec<u8>> {
        if encrypted.len() < 32
            || encrypted.len() > crate::protocol::MAX_MANIFEST_SIZE + 32
            || &encrypted[..4] != MAGIC
        {
            return Err(SyncError::new("encryptedDataInvalid"));
        }
        let aad = format!("{}\n{}", self.context, key);
        self.cipher()?
            .decrypt(
                Nonce::from_slice(&encrypted[4..16]),
                Payload {
                    msg: &encrypted[16..],
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| SyncError::new("encryptedDataInvalid"))
    }

    pub fn name(&self, key: &str) -> Result<String> {
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&self.name_key)
            .map_err(|_| SyncError::new("encryptedDataInvalid"))?;
        mac.update(key.as_bytes());
        Ok(hex(&mac.finalize().into_bytes()))
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub struct Unlocked {
    pub cipher: Cipher,
    pub metadata: EncryptionMetadata,
    pub fingerprint: String,
}

pub fn new_encryption(password: &str) -> Result<Unlocked> {
    validate_password(password)?;
    let mut salt = [0u8; 32];
    getrandom::getrandom(&mut salt).map_err(|_| SyncError::new("encryptedDataInvalid"))?;
    let header = EncryptionHeader {
        format: ENCRYPTION_FORMAT.to_string(),
        repository_id: Uuid::new_v4().to_string(),
        kdf: "PBKDF2-SHA256".to_string(),
        iterations: KDF_ITERATIONS,
        salt: hex(&salt),
    };
    let cipher = Cipher::derive(password, &header)?;
    let verifier = cipher.seal("key-check", CHECK)?;
    let metadata = EncryptionMetadata {
        format: header.format,
        repository_id: header.repository_id,
        kdf: header.kdf,
        iterations: header.iterations,
        salt: header.salt,
        verifier: hex(&verifier),
    };
    let fingerprint = hash_hex(&metadata.bytes()?);
    Ok(Unlocked {
        cipher,
        metadata,
        fingerprint,
    })
}

pub fn unlock(raw: &[u8], password: &str, pin: Option<&str>) -> Result<Unlocked> {
    let metadata = EncryptionMetadata::parse(raw)?;
    let fingerprint = hash_hex(&metadata.bytes()?);
    if pin.is_some_and(|pin| pin != fingerprint) {
        return Err(SyncError::new("encryptionChanged"));
    }
    let cipher = Cipher::derive(password, &metadata.header())?;
    let checked = cipher
        .open("key-check", &unhex(&metadata.verifier))
        .map_err(|_| SyncError::new("invalidSyncPassword"))?;
    if checked != CHECK {
        return Err(SyncError::new("invalidSyncPassword"));
    }
    Ok(Unlocked {
        cipher,
        metadata,
        fingerprint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_descriptor_round_trips_and_a_wrong_password_fails() {
        let unlocked = new_encryption("correct horse battery").unwrap();
        let raw = unlocked.metadata.bytes().unwrap();
        let same = unlock(&raw, "correct horse battery", Some(&unlocked.fingerprint)).unwrap();
        assert_eq!(same.fingerprint, unlocked.fingerprint);
        let sealed = same.cipher.seal("v1/head.json", b"head").unwrap();
        assert_eq!(same.cipher.open("v1/head.json", &sealed).unwrap(), b"head");
        let wrong = unlock(&raw, "wrong password here", None).err().unwrap();
        assert_eq!(wrong.code, "invalidSyncPassword");
    }

    #[test]
    fn a_legacy_head_is_refused_with_the_specific_error() {
        let raw = br#"{"format":"textus-cloud-sync/1"}"#;
        assert_eq!(
            EncryptionMetadata::parse(raw).unwrap_err().code,
            "legacyRemote"
        );
    }

    #[test]
    fn object_names_are_stable_and_tampering_fails() {
        let unlocked = new_encryption("correct horse battery").unwrap();
        let cipher = &unlocked.cipher;
        assert_eq!(
            cipher.name("v1/head.json").unwrap(),
            cipher.name("v1/head.json").unwrap()
        );
        let sealed = cipher.seal("v1/history.json", b"history").unwrap();
        let mut tampered = sealed.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 1;
        assert_eq!(
            cipher.open("v1/history.json", &tampered).unwrap_err().code,
            "encryptedDataInvalid"
        );
        assert_eq!(
            cipher.open("v1/head.json", &sealed).unwrap_err().code,
            "encryptedDataInvalid"
        );
    }

    #[test]
    fn a_password_must_be_twelve_to_1024_units_and_not_blank() {
        assert_eq!(
            validate_password("short").unwrap_err().code,
            "syncPasswordRequired"
        );
        assert!(validate_password("            ").is_err());
        assert!(validate_password("123456789012").is_ok());
    }
}
