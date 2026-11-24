//! Finding a Textus Hub on the local network, and the one-time payload a
//! desktop's QR code carries. Discovery only advertises a name, address,
//! port and repository id; pairing still needs the code.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub const SERVICE_TYPE: &str = "_textus-hub._tcp.local.";
pub const DISCOVERY_PORT: u16 = 7418;
const PROBE: &[u8] = b"TEXTUS-HUB-DISCOVER/1";
pub const PAIR_PREFIX: &str = "TEXTUS-HUB-PAIR/1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
    pub name: String,
    /// `http://<ip>:<port>`, the part a phone types.
    pub address: String,
    pub repo_id: String,
    /// `mdns`, `udp`, or `mdns+udp` when both found it.
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairPayload {
    pub address: String,
    pub code: String,
    pub repo_id: String,
}

impl PairPayload {
    pub fn encode(&self) -> String {
        format!(
            "{PAIR_PREFIX}\n{}",
            serde_json::to_string(self).unwrap_or_default()
        )
    }

    pub fn parse(text: &str) -> Option<Self> {
        let body = text.strip_prefix(PAIR_PREFIX)?.trim_start();
        let payload: Self = serde_json::from_str(body).ok()?;
        (!payload.address.is_empty()
            && !payload.code.is_empty()
            && !payload.repo_id.is_empty()
            && payload.code.len() == 6)
            .then_some(payload)
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct UdpReply {
    v: u32,
    name: String,
    address: String,
    repo_id: String,
}

/// Advertises one running Hub over mDNS and answers UDP probes. Dropping it
/// stops both. A Hub keeps serving even when discovery fails.
pub struct Advertiser {
    stop: Arc<AtomicBool>,
    mdns: Option<mdns_sd::ServiceDaemon>,
    udp: Option<JoinHandle<()>>,
}

impl Advertiser {
    pub fn start(bind: IpAddr, port: u16, name: &str, repo_id: &str) -> io::Result<Self> {
        let address = format!("http://{}", authority(bind, port));
        let stop = Arc::new(AtomicBool::new(false));
        let mdns = start_mdns(bind, port, name, repo_id).ok();
        let udp = start_udp(name, &address, repo_id, stop.clone()).ok();
        if mdns.is_none() && udp.is_none() {
            return Err(io::Error::other("no discovery transport started"));
        }
        Ok(Self { stop, mdns, udp })
    }
}

impl Drop for Advertiser {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(mdns) = &self.mdns {
            let _ = mdns.shutdown();
        }
        if let Some(udp) = self.udp.take() {
            let _ = udp.join();
        }
    }
}

fn start_mdns(
    bind: IpAddr,
    port: u16,
    name: &str,
    repo_id: &str,
) -> Result<mdns_sd::ServiceDaemon, Box<dyn std::error::Error + Send + Sync>> {
    let daemon = mdns_sd::ServiceDaemon::new()?;
    let host = format!("textus-{}.local.", repo_id.get(..8).unwrap_or("hub"));
    let mut properties = std::collections::HashMap::new();
    properties.insert("version".to_string(), "1".to_string());
    properties.insert("repo".to_string(), repo_id.to_string());
    properties.insert("name".to_string(), name.to_string());
    let info = mdns_sd::ServiceInfo::new(SERVICE_TYPE, name, &host, bind, port, properties)?;
    daemon.register(info)?;
    Ok(daemon)
}

fn start_udp(
    name: &str,
    address: &str,
    repo_id: &str,
    stop: Arc<AtomicBool>,
) -> io::Result<JoinHandle<()>> {
    let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))?;
    socket.set_read_timeout(Some(Duration::from_millis(400)))?;
    let reply = serde_json::to_vec(&UdpReply {
        v: 1,
        name: name.to_string(),
        address: address.to_string(),
        repo_id: repo_id.to_string(),
    })
    .unwrap_or_default();
    Ok(thread::spawn(move || {
        let mut buffer = [0u8; 512];
        while !stop.load(Ordering::Relaxed) {
            let Ok((length, peer)) = socket.recv_from(&mut buffer) else {
                continue;
            };
            if length != PROBE.len() || &buffer[..length] != PROBE || !private_peer(peer.ip()) {
                continue;
            }
            let _ = socket.send_to(&reply, peer);
        }
    }))
}

/// Finds nearby Hubs over mDNS and UDP. Both run at once; a result both
/// report is one row marked `mdns+udp`. Never blocks longer than `timeout`.
pub fn discover(timeout: Duration) -> Vec<Announcement> {
    let timeout = timeout.clamp(Duration::from_millis(300), Duration::from_secs(10));
    let deadline = Instant::now() + timeout;
    let (sender, receiver) = mpsc::channel();

    let mdns_sender = sender.clone();
    let mdns_thread = thread::spawn(move || browse_mdns(mdns_sender, deadline));
    let udp_sender = sender;
    let udp_thread = thread::spawn(move || probe_udp(udp_sender, deadline));

    let mut found = Vec::new();
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining.min(Duration::from_millis(200))) {
            Ok(item) => found.push(item),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = mdns_thread.join();
    let _ = udp_thread.join();
    merge(found)
}

fn browse_mdns(sender: mpsc::Sender<Announcement>, deadline: Instant) {
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        return;
    };
    let Ok(events) = daemon.browse(SERVICE_TYPE) else {
        return;
    };
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        match events.recv_timeout(remaining.min(Duration::from_millis(300))) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) => {
                if let Some(item) = from_mdns(&info) {
                    let _ = sender.send(item);
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = daemon.shutdown();
}

fn from_mdns(info: &mdns_sd::ResolvedService) -> Option<Announcement> {
    let mut addresses: Vec<Ipv4Addr> = info
        .addresses
        .iter()
        .filter_map(|address| match address.to_ip_addr() {
            IpAddr::V4(address) if address.is_private() || address.is_loopback() => Some(address),
            _ => None,
        })
        .collect();
    addresses.sort();
    let address = format!("http://{}:{}", addresses.first()?, info.port);
    let name = info
        .txt_properties
        .get_property_val_str("name")
        .unwrap_or_else(|| info.fullname.as_str())
        .to_string();
    let repo_id = info
        .txt_properties
        .get_property_val_str("repo")?
        .to_string();
    valid_repo(&repo_id).then_some(Announcement {
        name,
        address,
        repo_id,
        source: "mdns".to_string(),
    })
}

fn probe_udp(sender: mpsc::Sender<Announcement>, deadline: Instant) {
    let Ok(socket) = UdpSocket::bind(("0.0.0.0", 0)) else {
        return;
    };
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(Duration::from_millis(300)));
    let broadcast = SocketAddr::from(([255, 255, 255, 255], DISCOVERY_PORT));
    let local = SocketAddr::from(([127, 0, 0, 1], DISCOVERY_PORT));
    let _ = socket.send_to(PROBE, broadcast);
    let _ = socket.send_to(PROBE, local);
    let mut buffer = [0u8; 1024];
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let Ok((length, _)) = socket.recv_from(&mut buffer) else {
            continue;
        };
        let Ok(reply) = serde_json::from_slice::<UdpReply>(&buffer[..length]) else {
            continue;
        };
        let Some(announcement) = from_udp(reply) else {
            continue;
        };
        let _ = sender.send(announcement);
    }
}

fn from_udp(reply: UdpReply) -> Option<Announcement> {
    if reply.v != 1 || !valid_repo(&reply.repo_id) {
        return None;
    }
    let address = valid_address(&reply.address)?;
    Some(Announcement {
        name: reply.name,
        address,
        repo_id: reply.repo_id,
        source: "udp".to_string(),
    })
}

fn merge(items: Vec<Announcement>) -> Vec<Announcement> {
    let mut merged: BTreeMap<(String, String), Announcement> = BTreeMap::new();
    for item in items {
        let key = (item.address.clone(), item.repo_id.clone());
        match merged.get_mut(&key) {
            Some(existing) if existing.source != item.source => {
                existing.source = "mdns+udp".to_string();
            }
            Some(_) => {}
            None => {
                merged.insert(key, item);
            }
        }
    }
    let mut list: Vec<Announcement> = merged.into_values().collect();
    list.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.address.cmp(&right.address))
    });
    list
}

fn valid_address(value: &str) -> Option<String> {
    let rest = value.strip_prefix("http://")?;
    let (host, port) = rest.rsplit_once(':')?;
    let host: Ipv4Addr = host.parse().ok()?;
    let port: u16 = port.parse().ok()?;
    (port != 0 && (host.is_private() || host.is_loopback())).then(|| value.to_string())
}

fn valid_repo(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn private_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_loopback(),
    }
}

fn authority(bind: IpAddr, port: u16) -> String {
    match bind {
        IpAddr::V4(address) => format!("{address}:{port}"),
        IpAddr::V6(address) => format!("[{address}]:{port}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pair_payload_round_trips_and_rejects_other_text() {
        let payload = PairPayload {
            address: "http://192.168.1.5:7419".to_string(),
            code: "123456".to_string(),
            repo_id: "a".repeat(32),
        };
        let encoded = payload.encode();
        assert_eq!(PairPayload::parse(&encoded), Some(payload));
        assert!(PairPayload::parse("https://example.com").is_none());
        assert!(PairPayload::parse(&encoded.replace("123456", "12")).is_none());
    }

    #[test]
    fn discovery_keeps_one_row_when_both_paths_find_it() {
        let item = Announcement {
            name: "desk".to_string(),
            address: "http://192.168.1.5:7419".to_string(),
            repo_id: "a".repeat(32),
            source: "mdns".to_string(),
        };
        let mut udp = item.clone();
        udp.source = "udp".to_string();
        let merged = merge(vec![item, udp]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, "mdns+udp");
    }

    #[test]
    fn only_private_http_addresses_are_announced() {
        assert!(valid_address("http://192.168.1.5:7419").is_some());
        assert!(valid_address("http://127.0.0.1:7419").is_some());
        assert!(valid_address("http://8.8.8.8:7419").is_none());
        assert!(valid_address("https://192.168.1.5:7419").is_none());
        assert!(valid_address("http://192.168.1.5:0").is_none());
    }
}
