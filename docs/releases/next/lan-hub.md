### New

- Settings › Sync has a **Local network Hub**: this desktop can serve a sync
  repository to devices on the same Wi-Fi, without a cloud service. It shows
  the address, a one-time six-digit pairing code and a QR code, plus the
  paired devices with online/offline state; each device gets its own token
  and can be revoked.
- On a phone, Settings › Sync › **Join a Hub** can find nearby Hubs over mDNS
  and UDP broadcast, or scan the desktop's QR with the camera. The result is
  an ordinary WebDAV connection, so the same sync engine, history, conflicts
  and lock apply. Typing the address and code still works.
- The desktop can use its own Hub too ("Use this Hub for this vault"), which
  keeps one transport path for both devices.

### Platform notes

- The Hub only binds a private IPv4 address or loopback and has no public
  exposure, P2P or TLS in this version. Discovery is mDNS plus UDP broadcast
  on the local network; the connection is unencrypted, so use it only on a
  network you trust.
- Starting a Hub does not replace an existing connection: binding a vault is
  a separate action.
- Read-only devices and revocation are enforced by the Hub, not by the client.
