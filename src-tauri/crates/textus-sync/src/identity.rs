//! Document identity: the front matter's `textus_id`, read without opening
//! the whole note, and how two sides' entries pair by it. A cache only:
//! a missing id falls back to the path/hash rules in `planner`.

use crate::protocol::Entry;
use std::collections::BTreeMap;
use uuid::Uuid;

/// The `textus_id` in a Markdown file's front matter, normalized to the
/// lower-case hyphenated UUID form. None when the file has no readable id.
pub fn document_id(bytes: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(bytes).ok()?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for line in lines {
        let line = line.trim_end();
        if line == "---" || line == "..." {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim() == "textus_id" {
            return normalize_id(value);
        }
    }
    None
}

/// A UUID in the form the file and the manifest keep: lower case, hyphenated.
pub fn normalize_id(raw: &str) -> Option<String> {
    Uuid::parse_str(raw.trim().trim_matches(['"', '\'']))
        .ok()
        .map(|id| id.to_string())
}

/// What two sides' entries say about one document's path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentityPair {
    /// The local side renamed a file the remote still has at `from`.
    LocalRename { from: String, to: String },
    /// The remote renamed a file the local side still has at `from`.
    RemoteRename { from: String, to: String },
    /// One id sits at more than one path, or both sides renamed it
    /// differently: a copy/fork, never silently one document.
    Fork {
        id: String,
        local: Vec<String>,
        remote: Vec<String>,
    },
    /// The same path carries two different ids: two devices assigned one.
    Conflict {
        path: String,
        local_id: String,
        remote_id: String,
    },
}

/// Pairs entries by `id`. `base` (path -> hash) tells a rename from a fork:
/// a path in base is where the document was at the last sync.
pub fn pair(
    local: &BTreeMap<String, Entry>,
    remote: &BTreeMap<String, Entry>,
    base: &BTreeMap<String, String>,
) -> Vec<IdentityPair> {
    let mut ids: BTreeMap<String, (Vec<String>, Vec<String>)> = BTreeMap::new();
    for (path, entry) in local {
        if let Some(id) = entry.id.as_deref().and_then(normalize_id) {
            ids.entry(id).or_default().0.push(path.clone());
        }
    }
    for (path, entry) in remote {
        if let Some(id) = entry.id.as_deref().and_then(normalize_id) {
            ids.entry(id).or_default().1.push(path.clone());
        }
    }

    let mut out = Vec::new();
    for (id, (locals, remotes)) in ids {
        if locals.len() > 1 || remotes.len() > 1 {
            out.push(IdentityPair::Fork {
                id,
                local: locals,
                remote: remotes,
            });
            continue;
        }
        let (Some(l), Some(r)) = (locals.first(), remotes.first()) else {
            continue;
        };
        if l == r {
            continue;
        }
        let local_at_base = base.contains_key(l);
        let remote_at_base = base.contains_key(r);
        out.push(match (local_at_base, remote_at_base) {
            (false, true) => IdentityPair::LocalRename {
                from: r.clone(),
                to: l.clone(),
            },
            (true, false) => IdentityPair::RemoteRename {
                from: l.clone(),
                to: r.clone(),
            },
            _ => IdentityPair::Fork {
                id,
                local: locals,
                remote: remotes,
            },
        });
    }

    for (path, local_entry) in local {
        let Some(local_id) = local_entry.id.as_deref().and_then(normalize_id) else {
            continue;
        };
        let Some(remote_id) = remote
            .get(path)
            .and_then(|entry| entry.id.as_deref())
            .and_then(normalize_id)
        else {
            continue;
        };
        if local_id != remote_id {
            out.push(IdentityPair::Conflict {
                path: path.clone(),
                local_id,
                remote_id,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Block, Entry};

    const A: &str = "5f1c9a2e-4b7d-4c8a-9e3f-1a2b3c4d5e6f";
    const B: &str = "0b5c7e7a-2f7e-4f1f-9a6b-8d2c3e4f5a6b";

    fn entry(hash: &str, id: &str) -> Entry {
        Entry {
            hash: hash.to_string(),
            size: 1,
            blocks: vec![Block {
                hash: "a".repeat(64),
                size: 1,
            }],
            id: Some(id.to_string()),
        }
    }

    fn map(items: &[(&str, &str, &str)]) -> BTreeMap<String, Entry> {
        items
            .iter()
            .map(|(path, hash, id)| (path.to_string(), entry(hash, id)))
            .collect()
    }

    fn base(items: &[&str]) -> BTreeMap<String, String> {
        items
            .iter()
            .map(|path| (path.to_string(), "old".to_string()))
            .collect()
    }

    #[test]
    fn a_local_rename_is_the_path_missing_from_base() {
        let local = map(&[("b.md", "new", A)]);
        let remote = map(&[("a.md", "old", A)]);
        assert_eq!(
            pair(&local, &remote, &base(&["a.md"])),
            vec![IdentityPair::LocalRename {
                from: "a.md".to_string(),
                to: "b.md".to_string()
            }]
        );
    }

    #[test]
    fn a_remote_rename_is_the_path_still_in_base_at_home() {
        let local = map(&[("a.md", "new", A)]);
        let remote = map(&[("b.md", "old", A)]);
        assert_eq!(
            pair(&local, &remote, &base(&["a.md"])),
            vec![IdentityPair::RemoteRename {
                from: "a.md".to_string(),
                to: "b.md".to_string()
            }]
        );
    }

    #[test]
    fn two_renames_are_a_fork() {
        let local = map(&[("left.md", "l", A)]);
        let remote = map(&[("right.md", "r", A)]);
        assert!(matches!(
            pair(&local, &remote, &base(&["old.md"])).as_slice(),
            [IdentityPair::Fork { id, .. }] if id == A
        ));
    }

    #[test]
    fn a_copy_on_one_side_is_a_fork() {
        let local = map(&[("a.md", "a", A), ("copy.md", "c", A)]);
        let remote = map(&[("a.md", "a", A)]);
        assert!(matches!(
            pair(&local, &remote, &base(&["a.md"])).as_slice(),
            [IdentityPair::Fork { id, local, .. }] if id == A && local.len() == 2
        ));
    }

    #[test]
    fn two_ids_at_one_path_are_a_conflict() {
        let local = map(&[("a.md", "a", A)]);
        let remote = map(&[("a.md", "a", B)]);
        assert_eq!(
            pair(&local, &remote, &base(&["a.md"])),
            vec![IdentityPair::Conflict {
                path: "a.md".to_string(),
                local_id: A.to_string(),
                remote_id: B.to_string()
            }]
        );
    }

    #[test]
    fn front_matter_is_read_without_touching_body_text() {
        let text = format!("---\ntitle: x\ntextus_id: {A}\n---\n# Body\n");
        assert_eq!(document_id(text.as_bytes()).as_deref(), Some(A));
        assert_eq!(document_id(b"# no front matter\n").as_deref(), None);
        assert_eq!(
            document_id(b"---\ntextus_id: not-a-uuid\n---\n").as_deref(),
            None
        );
    }
}
