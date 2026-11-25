//! S3 transport, signed with SigV4. Path-style (the form Bitiful and
//! Qiniu accept) and virtual-hosted style are both built here; conditional
//! create is the standard `If-None-Match: *` PUT, so OSS needs its own
//! `x-oss-forbid-overwrite` adapter later. Qiniu Kodo refuses neither
//! header and needs its native upload token, so its create is a form
//! upload with `insertOnly`; everything else still goes through this S3
//! endpoint.

use crate::chunk::hash_hex;
use crate::error::{Result, SyncError};
use crate::kodo;
use crate::retry::{backoff, http_date_ms, retry_after, ATTEMPTS, LONGEST_WAIT};
use crate::store::ObjectStore;
use async_trait::async_trait;
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, DATE};
use reqwest::{Client, Method, Response, StatusCode, Url};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

type HmacSha256 = Hmac<Sha256>;

/// How a service spells a conditional create. OSS rejects
/// `If-None-Match` on PutObject and uses its own header instead; Kodo has
/// no conditional PutObject at all and creates through its upload service.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum S3Flavor {
    Standard,
    Oss,
    Kodo,
}

pub struct S3Store {
    client: Client,
    endpoint: Url,
    bucket: String,
    prefix: String,
    region: String,
    access_key: String,
    secret_key: String,
    path_style: bool,
    flavor: S3Flavor,
    /// The native upload host, set for Kodo only.
    upload_host: Option<String>,
    /// The server's clock minus ours, in milliseconds, from its last Date.
    /// Kodo's upload token is dated by the server, not this device.
    skew: Mutex<i64>,
    /// Until when every request waits: a busy server asked to be left.
    quiet_until: Mutex<Option<Instant>>,
}

impl S3Store {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        endpoint: &str,
        bucket: &str,
        prefix: &str,
        region: &str,
        access_key: &str,
        secret_key: &str,
        path_style: bool,
        flavor: S3Flavor,
    ) -> Result<Self> {
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
        if endpoint.scheme() == "http"
            && !matches!(
                endpoint.host_str().unwrap_or_default(),
                "localhost" | "127.0.0.1" | "::1"
            )
        {
            return Err(SyncError::new("invalidConfig"));
        }
        endpoint.set_query(None);
        endpoint.set_fragment(None);
        if bucket.is_empty() || region.is_empty() {
            return Err(SyncError::new("invalidConfig"));
        }
        if !prefix.trim_matches('/').is_empty()
            && !crate::path::relative_path(prefix.trim_matches('/'))
        {
            return Err(SyncError::new("invalidPrefix"));
        }
        let upload_host = if flavor == S3Flavor::Kodo {
            Some(
                kodo::upload_host(region)
                    .ok_or_else(|| SyncError::new("unsupportedRegion"))?
                    .to_string(),
            )
        } else {
            None
        };
        Ok(Self {
            client: Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                // Reconnect before a server's short keep-alive closes an idle
                // connection under us (encryption's KDF can pause for seconds).
                .pool_idle_timeout(std::time::Duration::from_secs(4))
                .connect_timeout(std::time::Duration::from_secs(20))
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .map_err(|_| SyncError::new("networkError"))?,
            endpoint,
            bucket: bucket.to_string(),
            prefix: prefix.trim_matches('/').to_string(),
            region: region.to_string(),
            access_key: access_key.to_string(),
            secret_key: secret_key.to_string(),
            path_style,
            flavor,
            upload_host,
            skew: Mutex::new(0),
            quiet_until: Mutex::new(None),
        })
    }

    /// The server's clock, once one of its answers has carried a Date.
    fn server_now_secs(&self) -> i64 {
        let skew = *self.skew.lock().unwrap_or_else(|error| error.into_inner());
        (Utc::now().timestamp_millis() + skew) / 1000
    }

    /// The upload token's deadline: one hour on the server's clock.
    fn kodo_deadline(&self) -> i64 {
        self.server_now_secs() + 3600
    }

    fn observe_date(&self, response: &Response) {
        let Some(value) = response
            .headers()
            .get(DATE)
            .and_then(|value| value.to_str().ok())
        else {
            return;
        };
        let Some(server) = http_date_ms(value) else {
            return;
        };
        let mut skew = self.skew.lock().unwrap_or_else(|error| error.into_inner());
        *skew = server - Utc::now().timestamp_millis();
    }

    /// Wait while a busy server asked every request to hold back.
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

    /// Whether `key` holds exactly `bytes`: a create refused after a lost
    /// answer was ours only when it does.
    async fn holds(&self, key: &str, bytes: &[u8]) -> Result<bool> {
        let Some(there) = self.get(key).await? else {
            return Ok(false);
        };
        Ok(hash_hex(&there) == hash_hex(bytes))
    }

    fn url_for(&self, key: &str) -> Result<Url> {
        let mut url = self.endpoint.clone();
        if self.path_style {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| SyncError::new("invalidConfig"))?;
            segments.push(&self.bucket);
            if !self.prefix.is_empty() {
                for part in self.prefix.split('/') {
                    segments.push(part);
                }
            }
            for part in key.split('/') {
                if part.is_empty() {
                    return Err(SyncError::new("invalidPath"));
                }
                segments.push(part);
            }
        } else {
            let host = url
                .host_str()
                .ok_or_else(|| SyncError::new("invalidConfig"))?;
            url.set_host(Some(&format!("{}.{}", self.bucket, host)))
                .map_err(|_| SyncError::new("invalidConfig"))?;
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| SyncError::new("invalidConfig"))?;
            if !self.prefix.is_empty() {
                for part in self.prefix.split('/') {
                    segments.push(part);
                }
            }
            for part in key.split('/') {
                if part.is_empty() {
                    return Err(SyncError::new("invalidPath"));
                }
                segments.push(part);
            }
        }
        Ok(url)
    }

    fn host_header(url: &Url) -> String {
        let host = url.host_str().unwrap_or_default();
        match url.port() {
            Some(port) => format!("{host}:{port}"),
            None => host.to_string(),
        }
    }

    /// One signed request. Repeatable requests are sent again after a lost
    /// answer or a gateway, and every request waits out a busy server; the
    /// answer says whether a resend could have landed (`resent`), which is
    /// what a refused create uses to tell its own first try from another's.
    async fn send(
        &self,
        method: Method,
        key: &str,
        body: Option<Vec<u8>>,
        extra: BTreeMap<String, String>,
        repeat: bool,
    ) -> Result<Sent> {
        let mut resent = false;
        for attempt in 0..ATTEMPTS {
            self.wait_quiet().await;
            let url = self.url_for(key)?;
            let payload = body.as_deref().unwrap_or(&[]);
            let payload_hash = hash_hex(payload);
            let now = Utc::now();
            let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
            let date = now.format("%Y%m%d").to_string();

            let mut headers: BTreeMap<String, String> = BTreeMap::new();
            headers.insert("host".to_string(), Self::host_header(&url));
            headers.insert("x-amz-content-sha256".to_string(), payload_hash.clone());
            headers.insert("x-amz-date".to_string(), amz_date.clone());
            for (name, value) in &extra {
                headers.insert(name.to_ascii_lowercase(), value.clone());
            }
            let signed_headers = headers.keys().cloned().collect::<Vec<_>>().join(";");
            let canonical_headers = headers
                .iter()
                .map(|(name, value)| format!("{name}:{}\n", value.trim()))
                .collect::<String>();
            let canonical_request = format!(
                "{}\n{}\n\n{}\n{}\n{}",
                method.as_str(),
                url.path(),
                canonical_headers,
                signed_headers,
                payload_hash
            );
            let scope = format!("{date}/{}/s3/aws4_request", self.region);
            let string_to_sign = format!(
                "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
                hash_hex(canonical_request.as_bytes())
            );
            let signature = self.signature(&date, &string_to_sign);
            let authorization = format!(
                "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
                self.access_key
            );

            let mut request_headers = HeaderMap::new();
            for (name, value) in &headers {
                request_headers.insert(
                    HeaderName::from_bytes(name.as_bytes())
                        .map_err(|_| SyncError::new("invalidConfig"))?,
                    HeaderValue::from_str(value).map_err(|_| SyncError::new("invalidConfig"))?,
                );
            }
            request_headers.insert(
                HeaderName::from_static("authorization"),
                HeaderValue::from_str(&authorization)
                    .map_err(|_| SyncError::new("invalidConfig"))?,
            );
            let mut request = self
                .client
                .request(method.clone(), url)
                .headers(request_headers);
            if let Some(body) = &body {
                request = request.body(body.clone());
            }
            let response = match request.send().await {
                Ok(response) => response,
                Err(_) if repeat && attempt + 1 < ATTEMPTS => {
                    // No answer: the request may still have been carried out.
                    resent = true;
                    tokio::time::sleep(backoff(attempt)).await;
                    continue;
                }
                Err(_) => return Err(SyncError::new("networkError")),
            };
            self.observe_date(&response);
            let status = response.status().as_u16();
            let busy = matches!(status, 429 | 503);
            let gateway = matches!(status, 502 | 504);
            if !(busy || (gateway && repeat)) || attempt + 1 >= ATTEMPTS {
                return Ok(Sent { response, resent });
            }
            if gateway {
                // A gateway may have passed the request on before it failed.
                resent = true;
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

    fn signature(&self, date: &str, string_to_sign: &str) -> String {
        let k_date = hmac(
            format!("AWS4{}", self.secret_key).as_bytes(),
            date.as_bytes(),
        );
        let k_region = hmac(&k_date, self.region.as_bytes());
        let k_service = hmac(&k_region, b"s3");
        let k_signing = hmac(&k_service, b"aws4_request");
        hex(&hmac(&k_signing, string_to_sign.as_bytes()))
    }

    fn refused(status: StatusCode) -> SyncError {
        match status.as_u16() {
            401 | 403 => SyncError::new("permissionError"),
            409 => SyncError::new("locked"),
            429 => SyncError::new("rateLimited"),
            507 => SyncError::new("quotaError"),
            code => SyncError::with_args("httpError", [code.to_string()]),
        }
    }

    pub async fn probe(&self) -> Result<()> {
        crate::store::probe(self).await
    }

    /// Kodo's conditional create: a native form upload whose token allows
    /// this one key and refuses to replace it. 614 is "file exists". The
    /// upload is sent again like a conditional PUT; after a lost answer a
    /// 614 may be this run's own first try, so the key is read back and
    /// only the same bytes count as ours.
    async fn kodo_create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        if !crate::path::relative_path(key) {
            return Err(SyncError::new("invalidPath"));
        }
        let host = self
            .upload_host
            .as_deref()
            .ok_or_else(|| SyncError::new("invalidConfig"))?;
        let full_key = if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix, key)
        };
        // Dated by the server's clock: a device whose clock is wrong still
        // gets a token the upload host accepts.
        let policy = kodo::put_policy(&self.bucket, &full_key, true, self.kodo_deadline());
        let token = kodo::upload_token(
            &self.access_key,
            &self.secret_key,
            &kodo::encode_policy(&policy),
        );
        let boundary = format!("----textus{}", uuid::Uuid::new_v4().simple());
        let body = kodo::multipart(&boundary, &token, &full_key, &bytes);
        // The region table holds public hosts; the loopback form exists
        // only for the transport test, which serves this endpoint itself.
        let scheme = if host.starts_with("127.0.0.1:") || host.starts_with("localhost:") {
            "http"
        } else {
            "https"
        };
        let url = Url::parse(&format!("{scheme}://{host}/"))
            .map_err(|_| SyncError::new("invalidConfig"))?;
        let mut resent = false;
        for attempt in 0..ATTEMPTS {
            self.wait_quiet().await;
            let response = match self
                .client
                .post(url.clone())
                .header(
                    CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(body.clone())
                .send()
                .await
            {
                Ok(response) => response,
                Err(_) if attempt + 1 < ATTEMPTS => {
                    // No answer: the upload may still have landed.
                    resent = true;
                    tokio::time::sleep(backoff(attempt)).await;
                    continue;
                }
                Err(_) => return Err(SyncError::new("networkError")),
            };
            self.observe_date(&response);
            let status = response.status().as_u16();
            let busy = matches!(status, 429 | 503);
            let gateway = matches!(status, 502 | 504);
            if !(busy || gateway) || attempt + 1 >= ATTEMPTS {
                return match status {
                    200..=299 => Ok(true),
                    614 => Ok(resent && self.holds(key, &bytes).await?),
                    code => Err(upload_refused(code)),
                };
            }
            if gateway {
                resent = true;
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
}

/// One answer, and whether a resend before it could have landed.
struct Sent {
    response: Response,
    resent: bool,
}

fn upload_refused(code: u16) -> SyncError {
    match code {
        401 | 403 => SyncError::new("permissionError"),
        429 => SyncError::new("rateLimited"),
        507 => SyncError::new("quotaError"),
        // A bad token, a bucket the key name does not match, or a host in
        // another region: all fixable in the connection settings.
        400 | 631 => SyncError::new("invalidConfig"),
        code => SyncError::with_args("httpError", [code.to_string()]),
    }
}

fn create_headers(flavor: S3Flavor) -> BTreeMap<String, String> {
    let mut extra = BTreeMap::new();
    match flavor {
        S3Flavor::Standard => {
            extra.insert("if-none-match".to_string(), "*".to_string());
        }
        S3Flavor::Oss => {
            extra.insert("x-oss-forbid-overwrite".to_string(), "true".to_string());
        }
        // Kodo's create never reaches a signed PUT.
        S3Flavor::Kodo => {}
    }
    extra
}

fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[async_trait]
impl ObjectStore for S3Store {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let sent = self
            .send(Method::GET, key, None, BTreeMap::new(), true)
            .await?;
        let response = sent.response;
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
        let sent = self
            .send(Method::HEAD, key, None, BTreeMap::new(), true)
            .await?;
        let response = sent.response;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        if !response.status().is_success() {
            return Err(Self::refused(response.status()));
        }
        Ok(true)
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        let sent = self
            .send(Method::PUT, key, Some(bytes), BTreeMap::new(), true)
            .await?;
        let response = sent.response;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(Self::refused(response.status()))
        }
    }

    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        if self.flavor == S3Flavor::Kodo {
            return self.kodo_create(key, bytes).await;
        }
        let extra = create_headers(self.flavor);
        let sent = self
            .send(Method::PUT, key, Some(bytes.clone()), extra, true)
            .await?;
        let response = sent.response;
        match self.flavor {
            S3Flavor::Oss => {
                if response.status() == StatusCode::CONFLICT {
                    return Ok(sent.resent && self.holds(key, &bytes).await?);
                }
                if response.status() == StatusCode::BAD_REQUEST {
                    return Err(SyncError::new("conditionalWriteUnsupported"));
                }
            }
            S3Flavor::Standard | S3Flavor::Kodo => {
                if response.status() == StatusCode::PRECONDITION_FAILED
                    || response.status() == StatusCode::CONFLICT
                {
                    // Sent again after no answer, a refusal may be to our
                    // own first try; other bytes mean another device's.
                    return Ok(sent.resent && self.holds(key, &bytes).await?);
                }
            }
        }
        if response.status().is_success() {
            Ok(true)
        } else {
            Err(Self::refused(response.status()))
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        // The lock's DELETE is not sent again: done the first time, a
        // second could remove another device's lock.
        let repeat = key != crate::protocol::LOCK_KEY;
        let sent = self
            .send(Method::DELETE, key, None, BTreeMap::new(), repeat)
            .await?;
        let response = sent.response;
        if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(Self::refused(response.status()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, AtomicU16, AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread::JoinHandle;
    use std::time::Duration;

    /// A tiny S3/upload host for the transport test: the first POST gets no
    /// answer (a lost reply), later ones get 614, and GET returns the bytes
    /// another device or this one left.
    struct TestHost {
        port: u16,
        posts: Arc<AtomicUsize>,
        puts: Arc<AtomicUsize>,
        drop_first: Arc<AtomicBool>,
        drop_first_put: Arc<AtomicBool>,
        post_status: Arc<AtomicU16>,
        put_status: Arc<AtomicU16>,
        object: Arc<Mutex<Vec<u8>>>,
        stop: Arc<AtomicBool>,
        thread: Option<JoinHandle<()>>,
    }

    impl TestHost {
        fn start() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let posts = Arc::new(AtomicUsize::new(0));
            let puts = Arc::new(AtomicUsize::new(0));
            let drop_first = Arc::new(AtomicBool::new(true));
            let drop_first_put = Arc::new(AtomicBool::new(false));
            let post_status = Arc::new(AtomicU16::new(0));
            let put_status = Arc::new(AtomicU16::new(0));
            let object = Arc::new(Mutex::new(Vec::new()));
            let stop = Arc::new(AtomicBool::new(false));
            let thread = {
                let posts = posts.clone();
                let puts = puts.clone();
                let drop_first = drop_first.clone();
                let drop_first_put = drop_first_put.clone();
                let post_status = post_status.clone();
                let put_status = put_status.clone();
                let object = object.clone();
                let stop = stop.clone();
                std::thread::spawn(move || {
                    while !stop.load(Ordering::SeqCst) {
                        match listener.accept() {
                            Ok((mut stream, _)) => {
                                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                                if let Ok((line, body)) = read_request(&mut stream) {
                                    if line.starts_with("POST ") {
                                        let first = posts.fetch_add(1, Ordering::SeqCst) == 0;
                                        let forced = post_status.load(Ordering::SeqCst);
                                        if forced != 0 {
                                            respond(&mut stream, forced, &[]);
                                            continue;
                                        }
                                        if first && drop_first.load(Ordering::SeqCst) {
                                            // No answer at all: the client
                                            // cannot know it landed.
                                            continue;
                                        }
                                        respond(&mut stream, 614, &[]);
                                    } else if line.starts_with("PUT ") {
                                        let first = puts.fetch_add(1, Ordering::SeqCst) == 0;
                                        let forced = put_status.load(Ordering::SeqCst);
                                        if first && drop_first_put.load(Ordering::SeqCst) {
                                            // The first PUT is lost after
                                            // it may have landed.
                                        } else if forced != 0 {
                                            respond(&mut stream, forced, &[]);
                                        } else {
                                            *object.lock().unwrap() = body;
                                            respond(&mut stream, 200, &[]);
                                        }
                                    } else if line.starts_with("GET ") {
                                        let body = object.lock().unwrap().clone();
                                        respond(&mut stream, 200, &body);
                                    } else {
                                        respond(&mut stream, 200, &[]);
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }
                })
            };
            Self {
                port,
                posts,
                puts,
                drop_first,
                drop_first_put,
                post_status,
                put_status,
                object,
                stop,
                thread: Some(thread),
            }
        }

        fn refuse_with(&self, status: u16) {
            self.drop_first.store(false, Ordering::SeqCst);
            self.post_status.store(status, Ordering::SeqCst);
        }

        fn store(&self) -> S3Store {
            let address = format!("127.0.0.1:{}", self.port);
            let mut store = S3Store::new(
                &format!("http://{address}"),
                "bucket",
                "",
                "cn-south-1",
                "ak",
                "sk",
                true,
                S3Flavor::Kodo,
            )
            .unwrap();
            store.upload_host = Some(address);
            store
        }

        fn standard_store(&self) -> S3Store {
            S3Store::new(
                &format!("http://127.0.0.1:{}", self.port),
                "bucket",
                "",
                "cn-east-1",
                "ak",
                "sk",
                true,
                S3Flavor::Standard,
            )
            .unwrap()
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
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            429 => "Too Many Requests",
            502 => "Bad Gateway",
            503 => "Service Unavailable",
            504 => "Gateway Timeout",
            614 => "File Exists",
            631 => "Bucket Not Found",
            _ => "Error",
        };
        let _ = write!(
            stream,
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(body);
    }

    #[test]
    fn a_flavor_picks_its_conditional_header() {
        assert_eq!(
            create_headers(S3Flavor::Standard).get("if-none-match"),
            Some(&"*".to_string())
        );
        assert_eq!(
            create_headers(S3Flavor::Oss).get("x-oss-forbid-overwrite"),
            Some(&"true".to_string())
        );
        assert!(!create_headers(S3Flavor::Standard).contains_key("x-oss-forbid-overwrite"));
        assert!(!create_headers(S3Flavor::Oss).contains_key("if-none-match"));
        assert!(create_headers(S3Flavor::Kodo).is_empty());
    }

    #[test]
    fn kodo_needs_a_region_with_an_upload_host() {
        assert_eq!(
            S3Store::new(
                "https://s3.cn-south-1.qiniucs.com",
                "bucket",
                "",
                "cn-south-1",
                "ak",
                "sk",
                true,
                S3Flavor::Kodo,
            )
            .unwrap()
            .upload_host
            .as_deref(),
            Some("up-z2.qiniup.com")
        );
        assert_eq!(
            S3Store::new(
                "https://s3.example.com",
                "bucket",
                "",
                "eu-west-1",
                "ak",
                "sk",
                true,
                S3Flavor::Kodo,
            )
            .err()
            .unwrap()
            .code,
            "unsupportedRegion"
        );
    }

    #[test]
    fn path_style_and_virtual_host_build_the_expected_urls() {
        let path = S3Store::new(
            "https://s3.example.com",
            "bucket",
            "a b",
            "cn-east-1",
            "ak",
            "sk",
            true,
            S3Flavor::Standard,
        )
        .unwrap();
        assert_eq!(
            path.url_for("v1/head.json").unwrap().as_str(),
            "https://s3.example.com/bucket/a%20b/v1/head.json"
        );
        let hosted = S3Store::new(
            "https://s3.example.com",
            "bucket",
            "notes",
            "cn-east-1",
            "ak",
            "sk",
            false,
            S3Flavor::Standard,
        )
        .unwrap();
        assert_eq!(
            hosted.url_for("v1/head.json").unwrap().as_str(),
            "https://bucket.s3.example.com/notes/v1/head.json"
        );
    }

    #[test]
    fn an_http_date_and_retry_after_are_read() {
        assert_eq!(http_date_ms("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        assert_eq!(
            http_date_ms("Wed, 21 Oct 2015 07:28:00 GMT"),
            Some(1_445_412_480_000)
        );
        assert_eq!(http_date_ms("not a date"), None);
        let store = S3Store::new(
            "https://s3.example.com",
            "bucket",
            "",
            "cn-east-1",
            "ak",
            "sk",
            true,
            S3Flavor::Standard,
        )
        .unwrap();
        *store.skew.lock().unwrap() = 3_600_000;
        assert!(store.server_now_secs() >= Utc::now().timestamp() + 3_599);
        assert!(store.kodo_deadline() >= Utc::now().timestamp() + 7_199);
    }

    #[tokio::test]
    async fn kodo_refuses_an_invalid_key_before_uploading() {
        let store = S3Store::new(
            "https://s3.cn-south-1.qiniucs.com",
            "bucket",
            "",
            "cn-south-1",
            "ak",
            "sk",
            true,
            S3Flavor::Kodo,
        )
        .unwrap();
        let error = store
            .create("../outside", b"one".to_vec())
            .await
            .unwrap_err();
        assert_eq!(error.code, "invalidPath");
    }

    #[tokio::test]
    async fn a_614_after_a_lost_upload_is_ours_only_for_the_same_bytes() {
        let host = TestHost::start();
        let store = host.store();
        *host.object.lock().unwrap() = b"ours".to_vec();
        assert!(store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());
        assert_eq!(host.posts.load(Ordering::SeqCst), 2);

        // The retry's 614 belongs to another device's different bytes.
        host.posts.store(0, Ordering::SeqCst);
        *host.object.lock().unwrap() = b"other".to_vec();
        assert!(!store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());

        // A 614 with no lost answer is never this run's create.
        host.posts.store(0, Ordering::SeqCst);
        host.drop_first.store(false, Ordering::SeqCst);
        assert!(!store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn a_412_after_a_lost_put_is_ours_only_for_the_same_bytes() {
        let host = TestHost::start();
        let store = host.standard_store();
        *host.object.lock().unwrap() = b"ours".to_vec();
        host.put_status.store(412, Ordering::SeqCst);
        host.drop_first_put.store(true, Ordering::SeqCst);
        assert!(store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());
        assert_eq!(host.puts.load(Ordering::SeqCst), 2);

        host.puts.store(0, Ordering::SeqCst);
        *host.object.lock().unwrap() = b"other".to_vec();
        assert!(!store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());

        host.puts.store(0, Ordering::SeqCst);
        host.drop_first_put.store(false, Ordering::SeqCst);
        assert!(!store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn upload_refusals_name_what_the_settings_can_fix() {
        let host = TestHost::start();
        let store = host.store();
        for (status, code) in [
            (400, "invalidConfig"),
            (631, "invalidConfig"),
            (401, "permissionError"),
            (403, "permissionError"),
            (507, "quotaError"),
        ] {
            host.refuse_with(status);
            let error = store
                .create("v1/lock.json", b"ours".to_vec())
                .await
                .unwrap_err();
            assert_eq!(error.code, code, "status {status}");
        }
    }

    #[tokio::test]
    async fn a_busy_upload_host_is_waited_out_until_the_last_try() {
        let host = TestHost::start();
        let store = host.store();
        host.refuse_with(429);
        let error = store
            .create("v1/lock.json", b"ours".to_vec())
            .await
            .unwrap_err();
        assert_eq!(error.code, "rateLimited");
        assert_eq!(host.posts.load(Ordering::SeqCst), ATTEMPTS);
    }
}
