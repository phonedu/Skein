### New

- Settings › Sync connects a folder to a WebDAV server or an S3-compatible bucket: save the connection, sync on demand, review conflict copies, and restore an earlier version from the cloud history. Credentials are kept apart from the connection and are never shown back in the page. An S3 connection can use the standard conditional write or Alibaba Cloud OSS's own header.
- On Android, the app's Documents library shows its sync state above the file tree and syncs on demand, including new, edited, deleted, renamed and conflicting notes. Folders the app can read as plain paths (its Documents, or a folder after all-files access is granted) sync too; a folder readable only through a system content grant stays with the Cloud Sync plugin.

### Improved

- A changed file downloads only the 2 MiB blocks this device does not already have, so editing a large attachment no longer downloads the whole file again.
- S3 and WebDAV requests retry a busy or briefly failing server with backoff and `Retry-After`; a MOVE or the lock's DELETE is never repeated after an uncertain answer.
- An S3 address at Bitiful fills its region and path-style setting; busy, quota and permission failures show readable text instead of a machine code.
