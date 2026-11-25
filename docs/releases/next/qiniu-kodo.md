### New

- Settings › Sync offers Qiniu Kodo as an S3 service. Kodo's S3 address accepts no conditional write, so a new lock is created with a native upload token and `insertOnly`; reads, edits and deletes still use the S3 address. Choose Qiniu Kodo, the bucket and one of Qiniu's regions; the server address is filled from the region. Kodo uploads retry like other requests, date the upload token by the server clock, and count a `614` after a retry as this device's own create only when the stored bytes match.
