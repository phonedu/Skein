//! History rules, the same the plugin applies: a replaced file joins its
//! path's versions, old versions thin to one per hour then one per day,
//! and the whole document is fitted to its size limit. Pure functions, so
//! the engine only decides what to read and write.

use crate::error::{Result, SyncError};
use crate::protocol::{History, Manifest, Origin, Version, MAX_VERSIONS};
use chrono::DateTime;
use std::collections::BTreeMap;

const HOUR_MS: i64 = 3_600_000;
const DAY_MS: i64 = 24 * HOUR_MS;

/// When a version stopped being current; 0 when the stamp is unreadable,
/// which sorts it as the oldest.
pub fn retired_at(version: &Version) -> i64 {
    version
        .until
        .as_deref()
        .and_then(|at| DateTime::parse_from_rfc3339(at).ok())
        .or_else(|| DateTime::parse_from_rfc3339(&version.at).ok())
        .map(|at| at.timestamp_millis())
        .unwrap_or(0)
}

/// The history after `remote` became `next`: a replaced or deleted file's
/// content joins its path's versions, and a path whose content did not
/// change keeps its origin.
pub fn retire(history: &History, remote: &Manifest, next: &Manifest, origin: &Origin) -> History {
    let mut out = history.clone();
    let mut current: BTreeMap<String, Origin> = BTreeMap::new();
    let mut versions = history.versions.clone();
    let was = |path: &str| -> Origin {
        history
            .current
            .get(path)
            .cloned()
            .unwrap_or_else(|| Origin {
                at: if remote.updated_at.is_empty() {
                    origin.at.clone()
                } else {
                    remote.updated_at.clone()
                },
                device: None,
            })
    };

    for (path, entry) in &next.files {
        let unchanged = remote
            .files
            .get(path)
            .is_some_and(|remote_entry| remote_entry.hash == entry.hash);
        current.insert(
            path.clone(),
            if unchanged { was(path) } else { origin.clone() },
        );
    }

    for (path, entry) in &remote.files {
        if next
            .files
            .get(path)
            .is_some_and(|next_entry| next_entry.hash == entry.hash)
        {
            continue;
        }
        let before = was(path);
        let version = Version {
            entry: entry.clone(),
            at: before.at,
            device: before.device,
            until: Some(origin.at.clone()),
        };
        let list = versions.entry(path.clone()).or_default();
        list.insert(0, version);
        list.truncate(MAX_VERSIONS);
    }

    out.current = current;
    out.versions = versions;
    out
}

/// Keeps, for each path, the newest version per hour for a day, then the
/// newest per day for `keep_days` (0: always), at most `cap`. Returns the
/// versions let go.
pub fn thin(
    versions: &mut BTreeMap<String, Vec<Version>>,
    now_ms: i64,
    keep_days: u32,
) -> Vec<Version> {
    let mut dropped = Vec::new();
    let paths: Vec<String> = versions.keys().cloned().collect();
    for path in paths {
        let list = versions.get(&path).cloned().unwrap_or_default();
        let mut sorted = list;
        sorted.sort_by_key(|version| std::cmp::Reverse(retired_at(version)));
        let mut seen = std::collections::HashSet::new();
        let mut kept = Vec::new();
        for version in sorted {
            let at = retired_at(&version);
            let age = now_ms - at;
            let bucket = if age < DAY_MS {
                format!("h{}", at.div_euclid(HOUR_MS))
            } else {
                format!("d{}", at.div_euclid(DAY_MS))
            };
            let expired = keep_days != 0 && age > i64::from(keep_days) * DAY_MS;
            if expired || seen.contains(&bucket) || kept.len() >= MAX_VERSIONS {
                dropped.push(version);
            } else {
                seen.insert(bucket);
                kept.push(version);
            }
        }
        if kept.is_empty() {
            versions.remove(&path);
        } else {
            versions.insert(path, kept);
        }
    }
    dropped
}

/// Lets the oldest versions go, whichever path they belong to, until the
/// history fits `limit`; returns them.
pub fn fit(history: &mut History, limit: usize) -> Result<Vec<Version>> {
    let encoded = serde_json::to_vec(history).map_err(|_| SyncError::new("invalidHistory"))?;
    if encoded.len() <= limit {
        return Ok(Vec::new());
    }
    // Oldest first, so the first ones removed are the least recent.
    let mut all: Vec<(String, Version)> = history
        .versions
        .iter()
        .flat_map(|(path, list)| {
            list.iter()
                .map(move |version| (path.clone(), version.clone()))
        })
        .collect();
    all.sort_by_key(|(_, version)| retired_at(version));

    let mut keep: BTreeMap<String, Vec<Version>> = history.versions.clone();
    let mut dropped = Vec::new();
    let mut size = encoded.len();
    for (path, version) in &all {
        if size <= limit {
            break;
        }
        let Some(list) = keep.get_mut(path) else {
            continue;
        };
        let Some(at) = list.iter().position(|other| other == version) else {
            continue;
        };
        list.remove(at);
        size = size.saturating_sub(
            serde_json::to_vec(version)
                .map(|raw| raw.len() + 1)
                .unwrap_or(1),
        );
        if list.is_empty() {
            keep.remove(path);
            size = size.saturating_sub(path.len() + 3);
        }
        dropped.push(version.clone());
    }
    history.versions = keep;
    let size = serde_json::to_vec(history).map_err(|_| SyncError::new("invalidHistory"))?;
    if size.len() > limit {
        return Err(SyncError::new("tooManyFiles"));
    }
    Ok(dropped)
}

/// Whether a run has anything to write: a changed head, a skipped head to
/// fold in, a new keep choice, or versions thinned away.
pub fn needs_publish(changed: bool, skipped: bool, keep_moved: bool, dropped: usize) -> bool {
    changed || skipped || keep_moved || dropped > 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Block, Entry, Keep, FORMAT};
    use std::collections::BTreeMap;

    fn entry(hash: &str) -> Entry {
        Entry {
            hash: hash.to_string(),
            size: 1,
            blocks: vec![Block {
                hash: "a".repeat(64),
                size: 1,
            }],
            id: None,
        }
    }

    fn version(at: &str, until: &str) -> Version {
        Version {
            entry: entry(&"b".repeat(64)),
            at: at.to_string(),
            device: None,
            until: Some(until.to_string()),
        }
    }

    fn history(versions: Vec<(&str, Version)>) -> History {
        let mut current = BTreeMap::new();
        current.insert(
            "a.md".to_string(),
            Origin {
                at: "2026-01-01T00:00:00.000Z".to_string(),
                device: Some("dev".to_string()),
            },
        );
        let mut map: BTreeMap<String, Vec<Version>> = BTreeMap::new();
        for (path, version) in versions {
            map.entry(path.to_string()).or_default().push(version);
        }
        History {
            format: FORMAT.to_string(),
            current,
            versions: map,
            previous: None,
            head: None,
            keep: Keep {
                days: 90,
                at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        }
    }

    #[test]
    fn retire_moves_a_replaced_file_into_versions() {
        let remote = Manifest::new(
            "r1".to_string(),
            "2026-01-01T00:00:00.000Z".to_string(),
            [("a.md".to_string(), entry(&"1".repeat(64)))].into(),
        );
        let next = Manifest::new(
            "r2".to_string(),
            "2026-01-02T00:00:00.000Z".to_string(),
            [("a.md".to_string(), entry(&"2".repeat(64)))].into(),
        );
        let origin = Origin {
            at: "2026-01-02T00:00:00.000Z".to_string(),
            device: Some("this".to_string()),
        };
        let out = retire(&history(vec![]), &remote, &next, &origin);
        let versions = &out.versions["a.md"];
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].entry.hash, "1".repeat(64));
        assert_eq!(versions[0].until.as_deref(), Some(origin.at.as_str()));
        assert_eq!(out.current["a.md"].device.as_deref(), Some("this"));
    }

    #[test]
    fn thin_keeps_one_per_hour_then_one_per_day() {
        let now = DateTime::parse_from_rfc3339("2026-03-10T12:00:00.000Z")
            .unwrap()
            .timestamp_millis();
        let mut versions = BTreeMap::new();
        versions.insert(
            "a.md".to_string(),
            vec![
                version("2026-03-10T11:10:00.000Z", "2026-03-10T11:20:00.000Z"),
                version("2026-03-10T11:30:00.000Z", "2026-03-10T11:40:00.000Z"),
                version("2026-03-09T00:00:00.000Z", "2026-03-09T00:10:00.000Z"),
                version("2026-03-09T05:00:00.000Z", "2026-03-09T05:10:00.000Z"),
            ],
        );
        let dropped = thin(&mut versions, now, 90);
        assert_eq!(dropped.len(), 2);
        assert_eq!(versions["a.md"].len(), 2);
    }

    #[test]
    fn thin_expires_versions_past_the_keep_days() {
        let now = DateTime::parse_from_rfc3339("2026-03-10T12:00:00.000Z")
            .unwrap()
            .timestamp_millis();
        let mut versions = BTreeMap::new();
        versions.insert(
            "a.md".to_string(),
            vec![version(
                "2025-01-01T00:00:00.000Z",
                "2025-01-02T00:00:00.000Z",
            )],
        );
        let dropped = thin(&mut versions, now, 30);
        assert_eq!(dropped.len(), 1);
        assert!(versions.is_empty());
    }

    #[test]
    fn thin_with_zero_days_keeps_everything_allowed_by_the_cap() {
        let now = DateTime::parse_from_rfc3339("2026-03-10T12:00:00.000Z")
            .unwrap()
            .timestamp_millis();
        let mut versions = BTreeMap::new();
        versions.insert(
            "a.md".to_string(),
            vec![version(
                "2020-01-01T00:00:00.000Z",
                "2020-01-02T00:00:00.000Z",
            )],
        );
        assert!(thin(&mut versions, now, 0).is_empty());
        assert_eq!(versions["a.md"].len(), 1);
    }

    #[test]
    fn fit_drops_the_oldest_versions_until_it_fits() {
        let mut history = history(vec![
            (
                "a.md",
                version("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"),
            ),
            (
                "a.md",
                version("2026-02-01T00:00:00.000Z", "2026-02-02T00:00:00.000Z"),
            ),
        ]);
        history.current.clear();
        let full = serde_json::to_vec(&history).unwrap().len();
        let dropped = fit(&mut history, full - 1).unwrap();
        assert_eq!(dropped.len(), 1);
        assert_eq!(history.versions["a.md"].len(), 1);
        assert_eq!(
            history.versions["a.md"][0].until.as_deref(),
            Some("2026-02-02T00:00:00.000Z")
        );
    }
}
