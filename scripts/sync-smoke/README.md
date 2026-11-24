# Desktop sync smoke

One command for a real desktop sync check: build a portable debug app, start
one or two instances with their own `TextusData`, drive the real **Settings ›
Sync** page over WebView2 CDP, run a scenario, verify, report and clean up.

This is the harness behind the [sync test project](../../docs/skein/specs/同步测试工程.md).
It does not replace crate tests, `*_live` tests or `npm run check`; it covers
the desktop UI path, two devices sharing one repository, and multiple vaults
sharing one connection in one app.

## Requirements

- Windows desktop (WebView2 CDP; the portable debug build has no
  single-instance lock).
- Node 22 and the repo's dependencies (`playwright` comes from the repo).
- A throwaway S3 bucket and its config, by default read from the ignored
  `.tmp-s1-s3/qiniu.local.json` (Kodo) or `.tmp-s1-s3/bitiful-textus.local.json`
  (standard S3). Pass `--config <path>` for another one.
- WebDAV needs no account: `--provider webdav` starts a small local DAV server
  on `127.0.0.1`. An external WebDAV server uses `--config` with
  `{endpoint, username, password}`. Docker/Nextcloud is not needed.
- Credentials are filled into the page from that file; they are never printed
  or written to the report.

## Run

```bash
node scripts/sync-smoke/run.mjs --provider kodo --scenario text --keep
node scripts/sync-smoke/run.mjs --provider bitiful --scenario text --no-build
node scripts/sync-smoke/run.mjs --provider kodo --scenario multi --no-build
node scripts/sync-smoke/run.mjs --provider kodo --scenario guard --no-build
node scripts/sync-smoke/run.mjs --provider kodo --scenario large --large --keep
node scripts/sync-smoke/run.mjs --provider webdav --scenario text --no-build
node scripts/sync-smoke/run.mjs --provider webdav --scenario move --no-build
```

- `--provider kodo|bitiful|webdav` — the service. WebDAV starts a local
  server unless `--config` gives an external one.
- `--scenario text` — two markdown files: first sync, edits, conflict, delete.
- `--scenario media` — PNG/JPEG/MP4/PDF/binary/empty/Unicode names and the
  2 MiB block boundary; first sync, binary edit, delete, PNG conflict.
- `--scenario multi` — one instance, four windows: shared connection and
  sub-repository, two vaults syncing at once, a same-prefix refusal, a copied
  vault forking to a new identity.
- `--scenario guard` — 60 files, a bulk delete, an empty folder and an injected
  stale lock; each destructive run is refused, cancelled, then confirmed.
- `--scenario large` — one 32 MiB file; `--large` adds 128 MiB (opt-in).
- `--scenario move` — sync, stop, rename the folder, reopen it and sync: the
  binding follows the identity and the remote prefix is unchanged.
- `--no-build` — reuse `src-tauri/target/debug/textus.exe` (the first run
  builds a portable debug build unless this is passed).
- `--keep` — keep the run directory and report even on success.
- `--config <path>` / `--prefix <value>` — override the credential file or
  the remote test prefix.

## What each scenario proves

### text

1. A uploads `Notes/from-a.md`; B downloads it.
2. B uploads `Notes/from-b.md`; A downloads it.
3. An edit on A reaches B, and an edit on B reaches A.
4. Both edit the same file: B keeps its bytes at the path, writes a
   `Sync conflicts/…` copy of A's bytes, and A downloads both.
5. B deletes a file; A removes it.
6. Both vaults end with the same SHA-256 tree (`.textus` excluded); the
   plaintext remote `v1/head.json` matches those hashes; `v1/lock.json` is gone.
7. The test prefix is deleted; the report records every step.

### media

- A uploads 13 files (~16 MiB): two real PNGs, a 3 MiB JPEG-labeled
  binary, an 8 MiB MP4-labeled binary, a PDF, a binary blob, an empty file,
  the 2 MiB boundary files, a nested file and two Unicode/space names. Sync
  is byte-level; only the PNGs are meant to decode.
- B downloads all 13 byte for byte; the 2 MiB, 2 MiB−1 and 2 MiB+1 files
  are checked for 1/1/2 blocks and the 8 MiB MP4 for 4.
- A binary edit on B reaches A; a delete on A reaches B; both editing the
  same PNG keeps both copies.
- Final tree and remote head hashes match; prefix cleaned.

### multi

- A configures a connection and syncs; C opens in a second window and binds
to A's connection with its own sub-repository (same connection id).
- The vault list shows both libraries; A and C sync at the same time; their
  remote repositories and local files never cross.
- Editing the shared connection's default prefix leaves both binding prefixes
  unchanged.
- D tries the same remote prefix and is refused (`repositoryInUse`), without
  a binding.
- A copy of A is offered a fork, gets a new `vaultId`, and syncs its own
  repository. Vault move/rename is not covered yet.

### guard

- 60 files sync; deleting 31 is refused with a bulk-delete prompt; cancelling
  leaves the remote at 60; confirming removes 31.
- Emptying the vault is refused with an empty-scan prompt; cancelling leaves
  the 29 remote files; confirming removes them (a second bulk prompt is
  answered too).
- A lock is injected into `v1/lock.json`; the next sync reports `locked` and
  leaves the head unchanged; the header's Remove lock clears it and the next
  sync publishes.

### large

- 32 MiB (16 blocks) by default; `--large` adds 128 MiB (64 blocks).
- A uploads, B downloads byte for byte; the remote head has the expected block
  count; the tree and cleanup checks are the same as media.

### move

- Configure and sync a vault; stop the app; rename the folder; start the same
  app data on the new path.
- The Sync page opens configured with the same prefix; the next sync is a
  no-op and the remote revision does not change.
- WebDAV runs use the same scenario against the local DAV server.

### webdav

The local server is a test fixture (`webdav-server.mjs`): Basic auth,
MKCOL/PUT/GET/HEAD/DELETE/MOVE/PROPFIND. Text and move run on it; it is not a
Nextcloud/NAS substitute. Docker/Nextcloud/MinIO profiles remain external.

## Output

- `.scratch/sync-smoke/<run-id>/report.json` — steps, counts, final paths,
  remote revision, cleanup result, PIDs and ports. No credentials.
- `<run-id>/A-failure.png` / `B-failure.png` on failure.
- Default: a successful run deletes its directory; `--keep` keeps it. A failed
  run is always kept. Delete it manually when the evidence is recorded.

## Known finding (fixed)

A Qiniu Kodo run once failed with `publishFailed` even though the remote
`head.json` had already committed the new revision; the run left
`v1/lock.json` behind. A GET after a successful head PUT can transiently fail
or read the old value. **S3v** added a short read-back retry; Kodo text runs
are 10/10 and Bitiful 1/1. The harness still reports any recurrence as a
failure (it does not hide it).

One multi run failed at E's sync with `networkError` and passed on the next
run. Transport-level retry/backoff is S5; the harness reports it as-is.

A harness note: result matching requires `last.at` to be at or after the click
that started the run. Without it, a confirm retry can return the previous
run's result and start the next step while the run still holds the lock; that
looked like a false `lockLost` in early guard runs.

## Next scenarios

Media (PNG/JPEG/MP4/PDF/binary/2 MiB boundary), multi-vault/multi-prefix, and
boundary cases (empty scan, bulk delete, stale lock). See the spec's §7.
