---
name: skein-sync
description: Work on the Skein fork's built-in sync - WebDAV/S3 transports, protocol v1, multi-vault, E2EE, mobile sync, the Sync settings page, or validating a sync change. Use when touching src-tauri/crates/textus-sync, src-tauri/src/sync, src-tauri/src/commands/sync.rs, src/platform/ipc-sync.ts, or src/settings/pages/SyncPage.tsx.
---

# Skein sync

The built-in sync is fork-specific: it lives beside upstream and must not reshape upstream's editor or document model. **Protocol v1 is frozen**; a change to what v1 means is a v2, not an edit.

## Read first

- `docs/skein/02-方案/同步协议-v1.md` §5–§8: write invariants, publish order, lock, delete/conflict.
- `docs/skein/02-方案/同步方案.md` §3/§7: layers and one run's algorithm.
- `docs/skein/03-调研/同步评审/README.md`; multi-vault changes also read `06-多库同步设计.md`.
- `docs/skein/05-状态/Textus-改造任务清单.md` S group: what is done, what is next, what is unverified.
- `docs/skein/01-纪律/工程菜谱.md` R1 and `薄fork魔改原则.md`.

## Shape

```text
UI    src/settings/pages/SyncPage.tsx
IPC   src/platform/ipc-sync.ts
Cmd   src-tauri/src/commands/sync.rs
Adptr src-tauri/src/sync/{mod,store,local}.rs   (I/O, settings, events only)
Core  src-tauri/crates/textus-sync/             (no Tauri; cargo test)
Xfer  S3 / WebDAV / LAN
```

The core crate owns planner, merge, history, publish, lock; the adapter reads settings, opens files and sends events; the UI sends commands and receives events. Do not move algorithm upward or copy a service per window.

## Invariants

- **Fail closed.** No half manifest, no publish after a failed check.
- **Publish order:** lock → read head/history → upload missing blocks → snapshot → history → head → read back → unlock. `head` is the commit point.
- **Lock:** `create` must be conditional. On 412/409 read it back: same owner id = already held; different owner = `locked`, never steal. Release only when the lock is still yours; a lost lock stops publishing.
- **Identity is the path**, not the hash. v1 has no rename: a local move is delete + add; history stays with the old path.
- **Delete** removes the entry and keeps versions in history. **Conflict** is two files; never silently overwrite.
- **Large deletion protection:** a non-empty base with an empty scan aborts; over 20% or 50 files needs a second confirmation. An empty scan is never "the remote deleted everything".
- **E2EE** is v2 (S2b); plaintext v1 stays readable. Do not invent v1 encryption fields.
- New code does not append to `trash`; that is old-client compatibility only.

## Workflow

1. Write the six task lines; find the S row that owns the work.
2. Decide: within v1, or a protocol change? Protocol change → v2 per §13; do not mutate v1.
3. Implement core in `textus-sync`, adapter in `src-tauri/src/sync`, command in `commands/sync.rs`; register in `bindings.rs` and `invoke_handler.rs`; add IPC in `ipc-sync.ts`; wire UI in `SyncPage.tsx`.
4. Test at the lowest layer: Rust unit/vectors, JS↔Rust differential, real WebDAV/S3 when credentials exist; built app for native behaviour.
5. Record: task list S row with evidence; protocol doc only for a protocol change; release note if users notice.

## Verify

```sh
cargo test -p textus-sync
npm run check:native
npm run check:quick
node scripts/check-skein-docs.mjs   # if docs changed
```

Use throwaway data folders and test servers; never point a test build at real user data.

## Don't

- Put sync algorithm in the adapter or UI, or copy the service per window.
- Change v1 field meaning, path acceptance, block layout or encryption parameters.
- Skip the lock/head order, or publish after `lockLost`.
- Silently overwrite a conflict, or treat an empty scan as a remote wipe.
- Add a new `trash` writer, or change signing/release workflows for a sync fix.
