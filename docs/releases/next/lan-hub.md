### New

- Settings › Sync has a **Local network Hub**: this desktop can serve a sync
  repository to devices on the same Wi-Fi, without a cloud service. It shows
  the address, a one-time six-digit pairing code and the paired devices;
  each device gets its own token and can be revoked.
- On a phone, Settings › Sync › **Join a Hub** takes that address and code.
  The result is an ordinary WebDAV connection, so the same sync engine,
  history, conflicts and lock apply.
- The desktop can use its own Hub too ("Use this Hub for this vault"), which
  keeps one transport path for both devices.

### Notes

- The Hub only binds a private IPv4 address or loopback; it has no discovery,
  no public exposure and no TLS in this version. The connection is
  unencrypted, so use it only on a network you trust.
- Starting a Hub does not replace an existing connection: binding a vault is
  a separate action.
- Read-only devices and revocation are enforced by the Hub, not by the client.
