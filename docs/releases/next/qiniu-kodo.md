### New

- Settings › Sync offers Qiniu Kodo as an S3 compatibility mode. Kodo accepts no conditional write on its S3 endpoint, so a new lock is created with a native upload token and `insertOnly`; reads, edits and deletes still use the S3 address. Choose "Qiniu Kodo (native upload)" and enter the S3 region, such as `cn-south-1`.
