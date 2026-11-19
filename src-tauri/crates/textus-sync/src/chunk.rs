//! Fixed 2 MiB blocks, SHA-256 names, as the v1 protocol requires. The
//! plugin's `content.ts` is the reference implementation.

use crate::error::{Result, SyncError};
use crate::protocol::{Block, Entry, CHUNK_SIZE, MAX_FILE_SIZE};
use sha2::{Digest, Sha256};

pub fn hash_hex(bytes: &[u8]) -> String {
    let sum = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in sum {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// The file's entry: its own hash, its size, and each block in order.
pub fn describe(bytes: &[u8]) -> Result<Entry> {
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(SyncError::new("tooLarge"));
    }
    let blocks = bytes
        .chunks(CHUNK_SIZE as usize)
        .map(|chunk| Block {
            hash: hash_hex(chunk),
            size: chunk.len() as u64,
        })
        .collect();
    Ok(Entry {
        hash: hash_hex(bytes),
        size: bytes.len() as u64,
        blocks,
    })
}

/// A downloaded block must be exactly the bytes its hash names.
pub fn verify(bytes: &[u8], hash: &str) -> bool {
    hash_hex(bytes) == hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_small_files_have_one_shape() {
        let empty = describe(b"").unwrap();
        assert_eq!(empty.size, 0);
        assert!(empty.blocks.is_empty());
        assert_eq!(
            empty.hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );

        let two = describe(b"ab").unwrap();
        assert_eq!(two.size, 2);
        assert_eq!(two.blocks.len(), 1);
        assert_eq!(two.blocks[0].size, 2);
    }

    #[test]
    fn a_file_is_split_at_two_mebibytes() {
        let bytes = vec![7u8; CHUNK_SIZE as usize + 3];
        let entry = describe(&bytes).unwrap();
        assert_eq!(entry.size, CHUNK_SIZE + 3);
        assert_eq!(entry.blocks.len(), 2);
        assert_eq!(entry.blocks[0].size, CHUNK_SIZE);
        assert_eq!(entry.blocks[1].size, 3);
        assert_eq!(
            entry.blocks[0].hash,
            hash_hex(&bytes[..CHUNK_SIZE as usize])
        );
    }

    #[test]
    fn too_large_is_refused_before_allocating_the_entry() {
        let bytes = vec![0u8; MAX_FILE_SIZE as usize + 1];
        assert_eq!(describe(&bytes).unwrap_err().code, "tooLarge");
    }
}
