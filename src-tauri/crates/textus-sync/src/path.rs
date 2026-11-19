//! Paths a repository may hold, and the names conflicts get. These follow
//! the plugin's `relativePath` / `inScope` / `conflictPath` so both clients
//! accept and produce the same keys.

use unicode_normalization::UnicodeNormalization;

const OBSIDIAN_SETTINGS: [&str; 7] = [
    "app.json",
    "appearance.json",
    "hotkeys.json",
    "bookmarks.json",
    "graph.json",
    "core-plugins.json",
    "types.json",
];
const DOCUMENT_EXTENSIONS: [&str; 8] = [
    "md", "markdown", "mdown", "mkd", "txt", "csv", "base", "canvas",
];
const ATTACHMENT_EXTENSIONS: [&str; 24] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico", "heic", "pdf", "doc", "docx",
    "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "mp3", "wav", "m4a", "ogg",
];
const MEDIA_EXTENSIONS: [&str; 3] = ["mp4", "mov", "webm"];
const IGNORED_FOLDERS: [&str; 5] = ["node_modules", "dist", "build", "target", "vendor"];

/// A repository-relative path: no empty or dot segments, no characters the
/// protocol reserves, no Windows device names, at most 1024 UTF-16 units.
pub fn relative_path(value: &str) -> bool {
    if value.is_empty() || value.encode_utf16().count() > 1024 {
        return false;
    }
    if value.chars().any(|c| {
        c == '\\'
            || c == ':'
            || c == '*'
            || c == '?'
            || c == '"'
            || c == '<'
            || c == '>'
            || c == '|'
            || c <= '\u{1f}'
            || c == '\u{7f}'
    }) {
        return false;
    }
    value.split('/').all(|part| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && !part.ends_with('.')
            && !part.ends_with(' ')
            && part.encode_utf16().count() <= 255
            && !reserved_name(part)
    })
}

fn reserved_name(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// The paths the sync carries: Textus project data, Obsidian's shared
/// settings when asked for them elsewhere, and ordinary documents and
/// attachments outside hidden or build folders.
pub fn in_scope(path: &str) -> bool {
    if !relative_path(path) {
        return false;
    }
    if is_obsidian_setting(path) {
        return true;
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts.first() == Some(&".textus") {
        return matches!(
            path,
            ".textus/agent.md" | ".textus/style.md" | ".textus/style.previous.md"
        ) || (parts.len() >= 3
            && matches!(
                parts[1].to_ascii_lowercase().as_str(),
                "library" | "memory" | "skills"
            )
            && path.to_ascii_lowercase().ends_with(".md")
            && parts[1..].iter().all(|part| !part.starts_with('.')));
    }
    parts
        .iter()
        .all(|part| !part.starts_with('.') && !ignored_folder(part))
        && (has_extension(path, &DOCUMENT_EXTENSIONS)
            || has_extension(path, &ATTACHMENT_EXTENSIONS)
            || has_extension(path, &MEDIA_EXTENSIONS))
}

fn ignored_folder(part: &str) -> bool {
    IGNORED_FOLDERS
        .iter()
        .any(|folder| part.eq_ignore_ascii_case(folder))
}

pub(crate) fn is_obsidian_setting(path: &str) -> bool {
    path.strip_prefix(".obsidian/")
        .is_some_and(|name| OBSIDIAN_SETTINGS.contains(&name))
}

fn has_extension(path: &str, extensions: &[&str]) -> bool {
    path.rsplit_once('.').is_some_and(|(_, ext)| {
        extensions
            .iter()
            .any(|known| ext.eq_ignore_ascii_case(known))
    })
}

/// The plugin's conflict name: the remote keeps the path, this copy goes
/// under `Sync conflicts/`, with the first eight hash characters.
pub fn conflict_path(path: &str, hash: &str) -> String {
    let safe = path
        .strip_prefix(".textus/")
        .map_or_else(|| path.to_string(), |rest| format!("Textus project/{rest}"));
    let dot = safe.rfind('.');
    let slash = safe.rfind('/');
    let end = match dot {
        Some(dot) if Some(dot) > slash.map(|slash| slash + 1) => dot,
        _ => safe.len(),
    };
    let suffix = hash.get(..8).unwrap_or(hash);
    format!("Sync conflicts/{} ({suffix}){}", &safe[..end], &safe[end..])
}

/// Paths differing only in case or Unicode composition would collide on a
/// case-insensitive file system; the manifest parser rejects both.
pub(crate) fn folded(path: &str) -> String {
    path.nfc().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_repository_relative_paths() {
        for good in ["a.md", "Notes/a.md", ".textus/agent.md", "a b/c.png"] {
            assert!(relative_path(good), "{good}");
        }
        for bad in [
            "",
            "/a.md",
            "a//b.md",
            "./a.md",
            "a/../b.md",
            "a\\b.md",
            "a.md ",
            "a./b.md",
            "con.md",
            "com3.txt",
            "a\u{1}b.md",
            &"a".repeat(1025),
        ] {
            assert!(!relative_path(bad), "{bad}");
        }
    }

    #[test]
    fn scope_is_textus_project_data_plus_documents_and_attachments() {
        assert!(in_scope("Notes/a.md"));
        assert!(in_scope("a.PNG"));
        assert!(in_scope(".textus/agent.md"));
        assert!(in_scope(".textus/library/a/b.md"));
        assert!(in_scope(".obsidian/app.json"));
        assert!(!in_scope(".obsidian/workspace.json"));
        assert!(!in_scope(".textus/other.md"));
        assert!(!in_scope(".git/config"));
        assert!(!in_scope("node_modules/a.md"));
        assert!(!in_scope("a.exe"));
    }

    #[test]
    fn conflicts_keep_the_remote_path_and_add_the_hash() {
        assert_eq!(
            conflict_path("Notes/a.md", "0123456789abcdef"),
            "Sync conflicts/Notes/a (01234567).md"
        );
        assert_eq!(
            conflict_path("README", "0123456789abcdef"),
            "Sync conflicts/README (01234567)"
        );
        assert_eq!(
            conflict_path(".textus/agent.md", "0123456789abcdef"),
            "Sync conflicts/Textus project/agent (01234567).md"
        );
    }
}
