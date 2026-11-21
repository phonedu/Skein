//! The read-only first-connect plan: what a run would do.

use super::*;

pub async fn preview(
    store: &dyn ObjectStore,
    local: &dyn LocalFiles,
    options: &SyncOptions,
) -> Result<SyncPreview> {
    let head = store
        .get(HEAD_KEY)
        .await?
        .map(|raw| Manifest::parse(&raw))
        .transpose()?;
    if head.is_none() && (!options.base.files.is_empty() || !options.base.parked.is_empty()) {
        return Err(SyncError::new("remoteMissing"));
    }
    let remote = head
        .as_ref()
        .map(|head| head.files.clone())
        .unwrap_or_default();
    let files: BTreeMap<String, Entry> = local
        .scan()
        .await?
        .into_iter()
        .filter(|(path, _)| in_scope(path))
        .collect();
    let empty_scan = !options.base.files.is_empty() && files.is_empty() && !remote.is_empty();
    let actions = plan(&files, &remote, &options.base.files);
    let moves = moves(&actions, &files, &remote, &options.base.files);
    let bulk_delete = is_bulk(&actions, &files, &remote);
    let mut preview = SyncPreview {
        empty_scan,
        bulk_delete,
        moved: moves.len(),
        ..SyncPreview::default()
    };
    let mut moved_paths = BTreeSet::new();
    for (to, from) in &moves {
        moved_paths.insert(to.clone());
        moved_paths.insert(from.clone());
    }
    for action in &actions {
        if moved_paths.contains(&action.path) {
            continue;
        }
        match action.kind {
            Kind::Equal => preview.unchanged += 1,
            Kind::Upload => {
                if let Some(entry) = files.get(&action.path) {
                    preview.uploaded += 1;
                    preview.upload_bytes += entry.size;
                }
            }
            Kind::Download => {
                if let Some(entry) = remote.get(&action.path) {
                    preview.downloaded += 1;
                    preview.download_bytes += entry.size;
                }
            }
            Kind::Conflict => preview.conflicts += 1,
            Kind::DeleteRemote => preview.removed_remote += 1,
            Kind::DeleteLocal => preview.removed_local += 1,
            Kind::Forget => {}
        }
    }
    Ok(preview)
}

fn is_bulk(
    actions: &[crate::planner::Action],
    local: &BTreeMap<String, Entry>,
    remote: &BTreeMap<String, Entry>,
) -> bool {
    let uploading: BTreeSet<&str> = actions
        .iter()
        .filter(|action| action.kind == Kind::Upload)
        .filter_map(|action| local.get(&action.path).map(|entry| entry.hash.as_str()))
        .collect();
    let downloading: BTreeSet<&str> = actions
        .iter()
        .filter(|action| action.kind == Kind::Download)
        .filter_map(|action| remote.get(&action.path).map(|entry| entry.hash.as_str()))
        .collect();
    let remote_deletes = actions
        .iter()
        .filter(|action| {
            action.kind == Kind::DeleteRemote
                && remote
                    .get(&action.path)
                    .is_some_and(|entry| !uploading.contains(entry.hash.as_str()))
        })
        .count();
    let local_deletes = actions
        .iter()
        .filter(|action| {
            action.kind == Kind::DeleteLocal
                && local
                    .get(&action.path)
                    .is_some_and(|entry| !downloading.contains(entry.hash.as_str()))
        })
        .count();
    let bulk =
        |total: usize, count: usize| count >= 2 && total > 0 && (count > 50 || count * 5 > total);
    bulk(remote.len(), remote_deletes) || bulk(local.len(), local_deletes)
}

