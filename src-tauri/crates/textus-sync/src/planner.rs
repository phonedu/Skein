//! Three-way planning, ported from the plugin's `planner.ts`: local files,
//! remote files, and the hashes this device last synced. The plan is a pure
//! function; nothing is written until the caller applies it.

use crate::path::is_obsidian_setting;
use crate::protocol::Entry;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Upload,
    Download,
    Conflict,
    Equal,
    Forget,
    DeleteRemote,
    DeleteLocal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Action {
    pub path: String,
    pub kind: Kind,
}

/// A side missing a file it had at the last sync deleted it; without that
/// baseline (a first sync) a missing file is only not there yet. An edit on
/// the other side wins over a deletion.
pub fn plan(
    local: &BTreeMap<String, Entry>,
    remote: &BTreeMap<String, Entry>,
    base: &BTreeMap<String, String>,
) -> Vec<Action> {
    let paths: BTreeSet<&String> = local
        .keys()
        .chain(remote.keys())
        .chain(base.keys())
        .collect();
    paths
        .into_iter()
        .map(|path| {
            let l = local.get(path).map(|entry| entry.hash.as_str());
            let r = remote.get(path).map(|entry| entry.hash.as_str());
            let b = base.get(path).map(String::as_str);
            let kind = match (l, r) {
                (Some(l), Some(r)) if l == r => Kind::Equal,
                (Some(_), Some(_)) => match (l == b, r == b) {
                    (_, true) => Kind::Upload,
                    (true, _) => Kind::Download,
                    _ if is_obsidian_setting(path) => Kind::Download,
                    _ => Kind::Conflict,
                },
                (None, Some(r)) if Some(r) == b => Kind::DeleteRemote,
                (None, Some(_)) => Kind::Download,
                (Some(l), None) if Some(l) == b => Kind::DeleteLocal,
                (Some(_), None) => Kind::Upload,
                (None, None) => Kind::Forget,
            };
            Action {
                path: path.clone(),
                kind,
            }
        })
        .collect()
}

/// Pairs a remote rename: a file to delete locally whose content arrives
/// under a new name. The download's source hash must be the deleted file's
/// hash, and the new name must be new on this device.
pub fn moves(
    actions: &[Action],
    local: &BTreeMap<String, Entry>,
    remote: &BTreeMap<String, Entry>,
    base: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    let mut gone: BTreeMap<String, String> = BTreeMap::new();
    for action in actions {
        if action.kind == Kind::DeleteLocal {
            if let Some(entry) = local.get(&action.path) {
                gone.entry(entry.hash.clone())
                    .or_insert_with(|| action.path.clone());
            }
        }
    }
    let mut pairs = BTreeMap::new();
    for action in actions {
        let Some(remote_entry) = remote.get(&action.path) else {
            continue;
        };
        let Some(from) = gone.get(&remote_entry.hash).cloned() else {
            continue;
        };
        if action.kind == Kind::Download
            && !local.contains_key(&action.path)
            && !base.contains_key(&action.path)
        {
            gone.remove(&remote_entry.hash);
            pairs.insert(action.path.clone(), from);
        }
    }
    pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(hash: &str) -> Entry {
        Entry {
            hash: hash.to_string(),
            size: 0,
            blocks: Vec::new(),
        }
    }

    fn map(items: &[(&str, &str)]) -> BTreeMap<String, Entry> {
        items
            .iter()
            .map(|(path, hash)| (path.to_string(), entry(hash)))
            .collect()
    }

    fn base(items: &[(&str, &str)]) -> BTreeMap<String, String> {
        items
            .iter()
            .map(|(path, hash)| (path.to_string(), hash.to_string()))
            .collect()
    }

    #[test]
    fn the_three_way_matrix() {
        let local = map(&[("same.md", "a"), ("changed.md", "b"), ("new.md", "n")]);
        let remote = map(&[("same.md", "a"), ("changed.md", "r"), ("old.md", "o")]);
        let baseline = base(&[("same.md", "a"), ("changed.md", "a"), ("old.md", "o")]);

        let actions = plan(&local, &remote, &baseline);
        let by_path: BTreeMap<_, _> = actions
            .iter()
            .map(|action| (action.path.as_str(), action.kind))
            .collect();
        assert_eq!(by_path["same.md"], Kind::Equal);
        assert_eq!(by_path["changed.md"], Kind::Conflict);
        assert_eq!(by_path["new.md"], Kind::Upload);
        assert_eq!(by_path["old.md"], Kind::DeleteRemote);
    }

    #[test]
    fn an_edit_wins_over_a_deletion() {
        let local = map(&[("edited.md", "new")]);
        let remote = map(&[]);
        let baseline = base(&[("edited.md", "old")]);
        assert_eq!(plan(&local, &remote, &baseline)[0].kind, Kind::Upload);

        let local = map(&[]);
        let remote = map(&[("edited.md", "new")]);
        let baseline = base(&[("edited.md", "old")]);
        assert_eq!(plan(&local, &remote, &baseline)[0].kind, Kind::Download);
    }

    #[test]
    fn a_first_sync_forgets_nothing() {
        let local = map(&[("a.md", "a")]);
        let remote = map(&[("b.md", "b")]);
        let actions = plan(&local, &remote, &base(&[]));
        assert!(actions.iter().all(|action| action.kind != Kind::Forget));
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn a_remote_rename_is_a_move_here() {
        let local = map(&[("old.md", "body")]);
        let remote = map(&[("new.md", "body")]);
        let baseline = base(&[("old.md", "body")]);
        let actions = plan(&local, &remote, &baseline);
        let pairs = moves(&actions, &local, &remote, &baseline);
        assert_eq!(pairs.get("new.md").map(String::as_str), Some("old.md"));
    }

    #[test]
    fn obsidian_settings_take_the_remote_copy_instead_of_conflicting() {
        let local = map(&[(".obsidian/app.json", "local")]);
        let remote = map(&[(".obsidian/app.json", "remote")]);
        let baseline = base(&[(".obsidian/app.json", "old")]);
        assert_eq!(plan(&local, &remote, &baseline)[0].kind, Kind::Download);
    }
}
