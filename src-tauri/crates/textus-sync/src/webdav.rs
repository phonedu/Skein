//! WebDAV transport. Writes use the plugin's portable create: PUT a unique
//! temporary object, then MOVE it with `Overwrite: F`; a refused MOVE to an
//! existing name means the object was already there.

use crate::error::{Result, SyncError};
use crate::retry::{backoff, retry_after, ATTEMPTS, LONGEST_WAIT};
use crate::store::ObjectStore;
use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Response, StatusCode, Url};
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

pub struct WebDavStore {
    client: Client,
    endpoint: Url,
    prefix: String,
    username: String,
    password: String,
    /// Collections this session has made or seen, so a block upload does
    /// not ask for `v1/blocks/ab` again.
    dirs: Mutex<HashSet<String>>,
    /// Until when every request waits: a busy server asked to be left.
    quiet_until: Mutex<Option<Instant>>,
}

impl WebDavStore {
    pub fn new(endpoint: &str, prefix: &str, username: &str, password: &str) -> Result<Self> {
        let mut endpoint = Url::parse(endpoint).map_err(|_| SyncError::new("invalidConfig"))?;
        if !matches!(endpoint.scheme(), "http" | "https")
            || endpoint.host_str().is_none()
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
        {
            return Err(SyncError::new("invalidConfig"));
        }
        if endpoint.scheme() == "http" && !plain_http_host(endpoint.host_str().unwrap_or_default())
        {
            // Basic auth and sync payloads do not travel in clear text. The
            // LAN Hub is the one exception: a private address is reachable
            // only from the same network, and pairing makes the choice explicit.
            return Err(SyncError::new("invalidConfig"));
        }
        endpoint.set_query(None);
        endpoint.set_fragment(None);
        let prefix = prefix.trim_matches('/').to_string();
        if !prefix.is_empty() && !crate::path::relative_path(&prefix) {
            return Err(SyncError::new("invalidPrefix"));
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            // Reconnect before a server's short keep-alive closes an idle
            // connection under us (encryption's KDF can pause for seconds).
            .pool_idle_timeout(std::time::Duration::from_secs(4))
            // A stalled server must not hold the lock forever.
            .connect_timeout(std::time::Duration::from_secs(20))
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .map_err(|_| SyncError::new("networkError"))?;
        Ok(Self {
            client,
            endpoint,
            prefix,
            username: username.to_string(),
            password: password.to_string(),
            dirs: Mutex::new(HashSet::new()),
            quiet_until: Mutex::new(None),
        })
    }

    fn url_for_parts(&self, parts: &[String]) -> Result<Url> {
        let mut url = self.endpoint.clone();
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| SyncError::new("invalidPath"))?;
            for part in parts {
                if part.is_empty() {
                    return Err(SyncError::new("invalidPath"));
                }
                segments.push(part);
            }
        }
        Ok(url)
    }

    fn url_for(&self, key: &str) -> Result<Url> {
        let mut parts = Vec::new();
        if !self.prefix.is_empty() {
            parts.extend(self.prefix.split('/').map(str::to_string));
        }
        for part in key.split('/') {
            if part.is_empty() {
                return Err(SyncError::new("invalidPath"));
            }
            parts.push(part.to_string());
        }
        self.url_for_parts(&parts)
    }

    async fn send(
        &self,
        method: Method,
        key: &str,
        body: Option<Vec<u8>>,
        headers: HeaderMap,
        repeat: bool,
    ) -> Result<Response> {
        self.send_url(method, self.url_for(key)?, body, headers, repeat)
            .await
    }

    /// One request. Repeatable requests survive a lost answer or a gateway;
    /// a busy server is waited out for every request. `repeat` is false for
    /// a MOVE (it may already have happened) and the lock's DELETE.
    async fn send_url(
        &self,
        method: Method,
        url: Url,
        body: Option<Vec<u8>>,
        headers: HeaderMap,
        repeat: bool,
    ) -> Result<Response> {
        for attempt in 0..ATTEMPTS {
            self.wait_quiet().await;
            let mut request = self
                .client
                .request(method.clone(), url.clone())
                .basic_auth(&self.username, Some(&self.password))
                .headers(headers.clone());
            if let Some(body) = &body {
                request = request.body(body.clone());
            }
            let response = match request.send().await {
                Ok(response) => response,
                Err(_) if repeat && attempt + 1 < ATTEMPTS => {
                    tokio::time::sleep(backoff(attempt)).await;
                    continue;
                }
                Err(_) => return Err(SyncError::new("networkError")),
            };
            let status = response.status().as_u16();
            let busy = matches!(status, 429 | 503);
            let gateway = matches!(status, 502 | 504);
            if !(busy || (gateway && repeat)) || attempt + 1 >= ATTEMPTS {
                return Ok(response);
            }
            let asked = retry_after(&response);
            if asked > LONGEST_WAIT {
                return Err(SyncError::new("rateLimited"));
            }
            let wait = backoff(attempt).max(asked);
            if busy {
                self.hold_until(wait);
            }
            tokio::time::sleep(wait).await;
        }
        Err(SyncError::new("networkError"))
    }

    async fn wait_quiet(&self) {
        loop {
            let wait = {
                let quiet = self
                    .quiet_until
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                quiet
                    .map(|until| until.saturating_duration_since(Instant::now()))
                    .unwrap_or_default()
            };
            if wait.is_zero() {
                return;
            }
            tokio::time::sleep(wait).await;
        }
    }

    fn hold_until(&self, wait: Duration) {
        let mut quiet = self
            .quiet_until
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let until = Instant::now() + wait;
        *quiet = Some(quiet.map_or(until, |current| current.max(until)));
    }

    async fn ensure_parents(&self, key: &str) -> Result<()> {
        let mut parts: Vec<String> = Vec::new();
        if !self.prefix.is_empty() {
            parts.extend(self.prefix.split('/').map(str::to_string));
        }
        let key_parts: Vec<&str> = key.split('/').collect();
        if key_parts.len() > 1 {
            for part in key_parts.iter().take(key_parts.len() - 1) {
                parts.push((*part).to_string());
            }
        }
        for end in 1..=parts.len() {
            let folders = &parts[..end];
            let folder = folders.join("/");
            let known = self
                .dirs
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .contains(&folder);
            if known {
                continue;
            }
            let url = self.url_for_parts(folders)?;
            let response = self
                .send_url(
                    Method::from_bytes(b"MKCOL").map_err(|_| SyncError::new("invalidConfig"))?,
                    url.clone(),
                    None,
                    HeaderMap::new(),
                    true,
                )
                .await?;
            if response.status().is_success() || self.is_folder_url(url).await.unwrap_or(false) {
                self.dirs
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .insert(folder);
                continue;
            }
            return Err(SyncError::with_args("folderNotCreated", [folder]));
        }
        Ok(())
    }

    async fn is_folder_url(&self, url: Url) -> Result<bool> {
        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("depth"),
            HeaderValue::from_static("0"),
        );
        let response = self
            .send_url(
                Method::from_bytes(b"PROPFIND").map_err(|_| SyncError::new("invalidConfig"))?,
                url,
                None,
                headers,
                true,
            )
            .await?;
        Ok(response.status() == StatusCode::MULTI_STATUS || response.status() == StatusCode::OK)
    }

    fn refused(status: StatusCode) -> SyncError {
        match status.as_u16() {
            401 | 403 => SyncError::new("permissionError"),
            429 => SyncError::new("rateLimited"),
            507 => SyncError::new("quotaError"),
            code => SyncError::with_args("httpError", [code.to_string()]),
        }
    }

    pub async fn probe(&self) -> Result<()> {
        crate::store::probe(self).await
    }
}

#[async_trait]
impl ObjectStore for WebDavStore {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let response = self
            .send(Method::GET, key, None, HeaderMap::new(), true)
            .await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(Self::refused(response.status()));
        }
        response
            .bytes()
            .await
            .map(|bytes| Some(bytes.to_vec()))
            .map_err(|_| SyncError::new("networkError"))
    }

    async fn has(&self, key: &str) -> Result<bool> {
        let response = self
            .send(Method::HEAD, key, None, HeaderMap::new(), true)
            .await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        if !response.status().is_success() {
            return Err(Self::refused(response.status()));
        }
        Ok(true)
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        self.ensure_parents(key).await?;
        let response = self
            .send(Method::PUT, key, Some(bytes), HeaderMap::new(), true)
            .await?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(Self::refused(response.status()))
        }
    }

    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        let temporary = format!("{key}.tmp-{}", Uuid::new_v4());
        self.put(&temporary, bytes).await?;
        let destination = self.url_for(key)?;
        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("destination"),
            HeaderValue::from_str(destination.as_str())
                .map_err(|_| SyncError::new("invalidPath"))?,
        );
        headers.insert(
            HeaderName::from_static("overwrite"),
            HeaderValue::from_static("F"),
        );
        let moved = self
            .send(
                Method::from_bytes(b"MOVE").map_err(|_| SyncError::new("invalidConfig"))?,
                &temporary,
                None,
                headers,
                // A MOVE may already have happened; a second could move
                // something else or find the temporary gone.
                false,
            )
            .await;
        let result = match moved {
            Ok(response) if response.status().is_success() => Ok(true),
            Ok(response)
                if response.status() == StatusCode::PRECONDITION_FAILED
                    || (response.status() == StatusCode::CONFLICT
                        && self.has(key).await.unwrap_or(false)) =>
            {
                Ok(false)
            }
            Ok(response) => Err(Self::refused(response.status())),
            Err(error) => Err(error),
        };
        let _ = self.delete(&temporary).await;
        result
    }

    async fn delete(&self, key: &str) -> Result<()> {
        // The lock's DELETE is not sent again: done the first time, a
        // second could remove another device's lock.
        let repeat = key != crate::protocol::LOCK_KEY;
        let response = self
            .send(Method::DELETE, key, None, HeaderMap::new(), repeat)
            .await?;
        if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(Self::refused(response.status()))
        }
    }
}

/// Clear-text HTTP is allowed on loopback and private IPv4 only: the LAN
/// Hub's reach, and nowhere a public network can see the token.
fn plain_http_host(host: &str) -> bool {
    if matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]") {
        return true;
    }
    host.parse::<std::net::Ipv4Addr>()
        .is_ok_and(|address| address.is_loopback() || address.is_private())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_and_key_become_encoded_path_segments() {
        let store = WebDavStore::new(
            "https://dav.example.com/remote.php/dav",
            "notes/a b",
            "u",
            "p",
        )
        .unwrap();
        assert_eq!(
            store.url_for("v1/head.json").unwrap().as_str(),
            "https://dav.example.com/remote.php/dav/notes/a%20b/v1/head.json"
        );
    }

    #[test]
    fn a_private_lan_address_may_use_plain_http() {
        assert!(WebDavStore::new("http://192.168.1.10:7419/hub/abc", "", "u", "p").is_ok());
        assert!(WebDavStore::new("http://10.0.0.5:7419/hub/abc", "", "u", "p").is_ok());
        assert!(WebDavStore::new("http://127.0.0.1:7419/hub/abc", "", "u", "p").is_ok());
        assert!(matches!(
            WebDavStore::new("http://dav.example.com/hub/abc", "", "u", "p"),
            Err(error) if error.code == "invalidConfig"
        ));
    }

    #[test]
    fn refuses_a_non_http_endpoint() {
        assert!(matches!(
            WebDavStore::new("file:///tmp", "", "u", "p"),
            Err(error) if error.code == "invalidConfig"
        ));
    }

    #[test]
    fn a_refused_status_keeps_the_reason_the_ui_explains() {
        assert_eq!(
            WebDavStore::refused(StatusCode::UNAUTHORIZED).code,
            "permissionError"
        );
        assert_eq!(
            WebDavStore::refused(StatusCode::TOO_MANY_REQUESTS).code,
            "rateLimited"
        );
        assert_eq!(
            WebDavStore::refused(StatusCode::INSUFFICIENT_STORAGE).code,
            "quotaError"
        );
        assert_eq!(
            WebDavStore::refused(StatusCode::INTERNAL_SERVER_ERROR).args,
            vec!["500".to_string()]
        );
    }

    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread::JoinHandle;
    use std::time::Duration;

    /// A tiny WebDAV host for the retry tests: it records each method, can
    /// drop the first answer to one of them, and answers the rest as a
    /// minimal server would.
    struct TestHost {
        port: u16,
        methods: Arc<Mutex<Vec<String>>>,
        drop_first: Arc<Mutex<HashSet<String>>>,
        object: Arc<Mutex<Vec<u8>>>,
        stop: Arc<AtomicBool>,
        thread: Option<JoinHandle<()>>,
    }

    impl TestHost {
        fn start() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let methods = Arc::new(Mutex::new(Vec::new()));
            let drop_first = Arc::new(Mutex::new(HashSet::new()));
            let object = Arc::new(Mutex::new(Vec::new()));
            let stop = Arc::new(AtomicBool::new(false));
            let thread = {
                let methods = methods.clone();
                let drop_first = drop_first.clone();
                let object = object.clone();
                let stop = stop.clone();
                std::thread::spawn(move || {
                    while !stop.load(Ordering::SeqCst) {
                        let Ok((mut stream, _)) = listener.accept() else {
                            break;
                        };
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                        let Ok((line, body)) = read_request(&mut stream) else {
                            continue;
                        };
                        let method = line
                            .split_whitespace()
                            .next()
                            .unwrap_or_default()
                            .to_string();
                        let first = {
                            let mut seen = methods.lock().unwrap();
                            let first = !seen.iter().any(|known| known == &method);
                            seen.push(method.clone());
                            first
                        };
                        if first && drop_first.lock().unwrap().contains(&method) {
                            continue;
                        }
                        match method.as_str() {
                            "GET" => {
                                let body = object.lock().unwrap().clone();
                                respond(&mut stream, 200, &body);
                            }
                            "HEAD" => respond(&mut stream, 200, &[]),
                            "PUT" => {
                                *object.lock().unwrap() = body;
                                respond(&mut stream, 201, &[]);
                            }
                            "MOVE" => respond(&mut stream, 201, &[]),
                            "MKCOL" => respond(&mut stream, 201, &[]),
                            "PROPFIND" => respond(&mut stream, 207, &[]),
                            "DELETE" => respond(&mut stream, 200, &[]),
                            _ => respond(&mut stream, 200, &[]),
                        }
                    }
                })
            };
            Self {
                port,
                methods,
                drop_first,
                object,
                stop,
                thread: Some(thread),
            }
        }

        fn store(&self) -> WebDavStore {
            WebDavStore::new(&format!("http://127.0.0.1:{}", self.port), "", "u", "p").unwrap()
        }

        fn drop_first(&self, method: &str) {
            self.drop_first.lock().unwrap().insert(method.to_string());
        }

        fn count(&self, method: &str) -> usize {
            self.methods
                .lock()
                .unwrap()
                .iter()
                .filter(|seen| seen.as_str() == method)
                .count()
        }
    }

    impl Drop for TestHost {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            let _ = TcpStream::connect(("127.0.0.1", self.port));
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }

    fn read_request(stream: &mut TcpStream) -> std::io::Result<(String, Vec<u8>)> {
        let mut reader = BufReader::new(stream.try_clone()?);
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let mut length = 0;
        loop {
            let mut header = String::new();
            if reader.read_line(&mut header)? == 0 || header == "\r\n" {
                break;
            }
            if let Some(value) = header.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap_or(0);
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body)?;
        Ok((line, body))
    }

    fn respond(stream: &mut TcpStream, status: u16, body: &[u8]) {
        let reason = match status {
            200 => "OK",
            201 => "Created",
            207 => "Multi-Status",
            _ => "Error",
        };
        let _ = write!(
            stream,
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(body);
    }

    #[tokio::test]
    async fn a_repeatable_request_survives_a_lost_answer() {
        let host = TestHost::start();
        host.drop_first("GET");
        *host.object.lock().unwrap() = b"hello".to_vec();
        let store = host.store();
        assert_eq!(
            store.get("v1/a.txt").await.unwrap(),
            Some(b"hello".to_vec())
        );
        assert_eq!(host.count("GET"), 2);
    }

    #[tokio::test]
    async fn a_lock_delete_is_not_sent_again_after_no_answer() {
        let host = TestHost::start();
        host.drop_first("DELETE");
        let store = host.store();
        let error = store.delete(crate::protocol::LOCK_KEY).await.unwrap_err();
        assert_eq!(error.code, "networkError");
        assert_eq!(host.count("DELETE"), 1);
    }

    #[tokio::test]
    async fn a_move_is_not_sent_again_after_no_answer() {
        let host = TestHost::start();
        host.drop_first("MOVE");
        let store = host.store();
        let error = store
            .create(crate::protocol::LOCK_KEY, b"one".to_vec())
            .await
            .unwrap_err();
        assert_eq!(error.code, "networkError");
        assert_eq!(host.count("MOVE"), 1);
    }

    #[tokio::test]
    async fn a_put_is_sent_again_and_reaches_the_host() {
        let host = TestHost::start();
        host.drop_first("PUT");
        let store = host.store();
        store.put("v1/a.txt", b"two".to_vec()).await.unwrap();
        assert_eq!(*host.object.lock().unwrap(), b"two");
        assert_eq!(host.count("PUT"), 2);
    }
}
