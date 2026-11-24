### Fixed

- A sync no longer reports a failed publish, and no longer leaves a stale lock, when the remote head was already committed but the read-back briefly failed or returned the previous head. It retries the read-back a few times before giving up.
