//! The HTTP and WebDAV surface. Every hub request is authenticated with a
//! device token except pairing; the desktop is simply another device.

use crate::auth::{Auth, DeviceInfo, PairError, PairingInfo};
use crate::storage::{allowed_bind, allowed_peer, lan_addresses, Repository};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use bytes::Bytes;
use http::header::{
    ALLOW, AUTHORIZATION, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, WWW_AUTHENTICATE,
};
use http::{HeaderValue, Method, Request, Response, StatusCode, Uri};
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::fmt;
use std::io;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::watch;

/// The largest object the protocol allows: one source document.
const MAX_BODY: u64 = 128 * 1024 * 1024;
const MAX_PAIR_BODY: usize = 16 * 1024;

#[derive(Debug, Clone)]
pub struct HubConfig {
    /// The repository's own folder; the app passes something under its data
    /// directory, never a vault.
    pub root: PathBuf,
    /// Loopback or a private IPv4 address. Anything else is refused.
    pub bind: IpAddr,
    /// 0 asks the OS for a free port (tests); the settings page reports a
    /// busy 7419 rather than choosing another.
    pub port: u16,
    /// The permission the next pairing code grants.
    pub read_only_new_devices: bool,
    /// The desktop token from a previous start, when it still has one.
    pub local_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAccess {
    pub device_id: String,
    /// Present only when a new local token was made; the caller stores it.
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubStatus {
    pub repo_id: String,
    pub bind: String,
    pub port: u16,
    /// `http://<bind>:<port>`, the part a phone types.
    pub address: String,
    /// The address plus `/hub/<repoId>`, the desktop's WebDAV endpoint.
    pub base_url: String,
    pub lan_addresses: Vec<String>,
    pub pairing: Option<PairingInfo>,
    pub devices: Vec<DeviceInfo>,
}

#[derive(Debug, Clone)]
pub struct HubError {
    pub code: &'static str,
    pub message: String,
}

impl HubError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for HubError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for HubError {}

pub struct StartedHub {
    pub hub: Hub,
    pub local: LocalAccess,
    pub pairing: PairingInfo,
}

pub struct Hub {
    inner: Arc<Inner>,
    shutdown: watch::Sender<bool>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

struct Inner {
    repository: Repository,
    auth: Auth,
    bind: IpAddr,
    port: u16,
}

impl Hub {
    pub async fn start(config: HubConfig) -> Result<StartedHub, HubError> {
        if !allowed_bind(config.bind) {
            return Err(HubError::new(
                "invalidConfig",
                "the Hub only binds loopback or a private IPv4 address",
            ));
        }
        let repository = Repository::open(&config.root)
            .map_err(|error| HubError::new("ioError", error.to_string()))?;
        let auth = Auth::load(&config.root.join("devices.json"))
            .map_err(|error| HubError::new("ioError", error.to_string()))?;
        let (local, local_token) = auth
            .ensure_local(config.local_token.as_deref())
            .map_err(|error| HubError::new("ioError", error.to_string()))?;
        let pairing = auth
            .new_code(config.read_only_new_devices)
            .map_err(|error| HubError::new("ioError", error.to_string()))?;

        let listener = TcpListener::bind(SocketAddr::new(config.bind, config.port))
            .await
            .map_err(bind_error)?;
        let port = listener
            .local_addr()
            .map_err(|error| HubError::new("ioError", error.to_string()))?
            .port();
        let inner = Arc::new(Inner {
            repository,
            auth,
            bind: config.bind,
            port,
        });
        let (shutdown, mut stopped) = watch::channel(false);
        let serving = inner.clone();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = stopped.changed() => break,
                    accepted = listener.accept() => {
                        let Ok((stream, peer)) = accepted else { continue };
                        if !allowed_peer(peer.ip()) {
                            continue;
                        }
                        let inner = serving.clone();
                        let mut stop = stopped.clone();
                        tokio::spawn(async move {
                            let service = service_fn(move |request| {
                                let inner = inner.clone();
                                async move { Ok::<_, Infallible>(handle(inner, peer, request).await) }
                            });
                            let connection = hyper::server::conn::http1::Builder::new()
                                .serve_connection(TokioIo::new(stream), service);
                            tokio::pin!(connection);
                            tokio::select! {
                                _ = stop.changed() => {
                                    // Stop accepting new requests on a kept-alive
                                    // connection too, not just on the listener.
                                    connection.as_mut().graceful_shutdown();
                                    let _ = connection.await;
                                }
                                _ = &mut connection => {}
                            }
                        });
                    }
                }
            }
        });
        Ok(StartedHub {
            hub: Self {
                inner,
                shutdown,
                task: Mutex::new(Some(task)),
            },
            local: LocalAccess {
                device_id: local.id,
                token: local_token,
            },
            pairing,
        })
    }

    pub fn status(&self) -> HubStatus {
        let bind = self.inner.bind;
        let port = self.inner.port;
        let address = format!("http://{}", authority(bind, port));
        HubStatus {
            repo_id: self.inner.repository.id().to_string(),
            bind: bind.to_string(),
            port,
            address: address.clone(),
            base_url: format!("{address}/hub/{}", self.inner.repository.id()),
            lan_addresses: lan_addresses(),
            pairing: self.inner.auth.current_code(),
            devices: self.inner.auth.devices(),
        }
    }

    pub fn new_code(&self, read_only: bool) -> Result<PairingInfo, HubError> {
        self.inner
            .auth
            .new_code(read_only)
            .map_err(|error| HubError::new("ioError", error.to_string()))
    }

    pub fn revoke(&self, device_id: &str) -> Result<bool, HubError> {
        self.inner
            .auth
            .revoke(device_id)
            .map_err(|error| HubError::new("ioError", error.to_string()))
    }

    pub async fn shutdown(&self) {
        let _ = self.shutdown.send(true);
        let task = self
            .task
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
        if let Some(task) = task {
            let _ = task.await;
        }
    }
}

impl Drop for Hub {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
    }
}

fn bind_error(error: io::Error) -> HubError {
    match error.kind() {
        io::ErrorKind::AddrInUse => HubError::new("portInUse", "the port is already in use"),
        io::ErrorKind::PermissionDenied => HubError::new("permissionError", error.to_string()),
        _ => HubError::new("ioError", error.to_string()),
    }
}

fn authority(bind: IpAddr, port: u16) -> String {
    match bind {
        IpAddr::V4(address) => format!("{address}:{port}"),
        IpAddr::V6(address) => format!("[{address}]:{port}"),
    }
}

async fn handle(
    inner: Arc<Inner>,
    peer: SocketAddr,
    request: Request<Incoming>,
) -> Response<Full<Bytes>> {
    let path = request.uri().path().to_string();
    if path == "/pair" {
        if request.method() != Method::POST {
            return method_not_allowed("POST");
        }
        return pair(&inner, peer, request).await;
    }
    let Some(key) = route_key(&inner, &path) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let device = match authenticate(&inner, &request) {
        Some(device) => device,
        None => return unauthorized(),
    };
    let read_only = device.read_only;
    match request.method().as_str() {
        "GET" | "HEAD" => get(&inner, &key, request.method() == Method::HEAD).await,
        "PROPFIND" => propfind(&inner, &key, &request).await,
        "PUT" => {
            if read_only {
                return empty(StatusCode::FORBIDDEN);
            }
            put(&inner, &key, request).await
        }
        "MKCOL" => {
            if read_only {
                return empty(StatusCode::FORBIDDEN);
            }
            mkcol(&inner, &key).await
        }
        "DELETE" => {
            if read_only {
                return empty(StatusCode::FORBIDDEN);
            }
            delete(&inner, &key).await
        }
        "MOVE" => {
            if read_only {
                return empty(StatusCode::FORBIDDEN);
            }
            mv(&inner, &key, &request).await
        }
        _ => method_not_allowed("GET, HEAD, PROPFIND, PUT, MKCOL, DELETE, MOVE"),
    }
}

fn authenticate(inner: &Inner, request: &Request<Incoming>) -> Option<DeviceInfo> {
    let value = request.headers().get(AUTHORIZATION)?.to_str().ok()?;
    let mut parts = value.splitn(2, ' ');
    if !parts.next()?.eq_ignore_ascii_case("basic") {
        return None;
    }
    let decoded = STANDARD.decode(parts.next()?.trim()).ok()?;
    let text = String::from_utf8(decoded).ok()?;
    let (id, token) = text.split_once(':')?;
    inner.auth.authorize(id, token)
}

fn route_key(inner: &Inner, path: &str) -> Option<String> {
    let prefix = format!("/hub/{}", inner.repository.id());
    let rest = path.strip_prefix(&prefix)?;
    if rest.is_empty() {
        return Some(String::new());
    }
    let rest = rest.strip_prefix('/')?;
    let rest = rest.trim_end_matches('/');
    if rest.is_empty() {
        return Some(String::new());
    }
    let mut key = String::new();
    for segment in rest.split('/') {
        let decoded = percent_decode_str(segment).decode_utf8().ok()?;
        if decoded.is_empty()
            || decoded.contains('/')
            || decoded.contains('\\')
            || decoded.contains('\0')
        {
            return None;
        }
        if !key.is_empty() {
            key.push('/');
        }
        key.push_str(&decoded);
    }
    Some(key)
}

async fn pair(
    inner: &Inner,
    peer: SocketAddr,
    request: Request<Incoming>,
) -> Response<Full<Bytes>> {
    #[derive(Deserialize)]
    struct Body {
        code: String,
        #[serde(default)]
        device: String,
    }
    let bytes = match read_limited(request.into_body(), MAX_PAIR_BODY).await {
        Ok(bytes) => bytes,
        Err(status) => return empty(status),
    };
    let Ok(body) = serde_json::from_slice::<Body>(&bytes) else {
        return empty(StatusCode::BAD_REQUEST);
    };
    match inner.auth.pair(peer.ip(), &body.code, &body.device) {
        Ok((device, token)) => json(
            StatusCode::OK,
            &serde_json::json!({
                "repoId": inner.repository.id(),
                "username": device.id,
                "token": token,
                "readOnly": device.read_only,
                "device": device,
            }),
        ),
        Err(PairError::InvalidCode) => json(
            StatusCode::UNAUTHORIZED,
            &serde_json::json!({ "error": "invalidCode" }),
        ),
        Err(PairError::Expired) => {
            json(StatusCode::GONE, &serde_json::json!({ "error": "expired" }))
        }
        Err(PairError::TooManyAttempts) => json(
            StatusCode::TOO_MANY_REQUESTS,
            &serde_json::json!({ "error": "tooManyAttempts" }),
        ),
        Err(PairError::Store) => json(
            StatusCode::INTERNAL_SERVER_ERROR,
            &serde_json::json!({ "error": "store" }),
        ),
    }
}

async fn get(inner: &Inner, key: &str, head: bool) -> Response<Full<Bytes>> {
    let Ok(path) = inner.repository.path(key) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(metadata) = tokio::fs::metadata(&path).await else {
        return empty(StatusCode::NOT_FOUND);
    };
    if metadata.is_dir() {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    if head {
        let mut response = empty(StatusCode::OK);
        response.headers_mut().insert(
            CONTENT_LENGTH,
            HeaderValue::from_str(&metadata.len().to_string()).unwrap(),
        );
        response.headers_mut().insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        );
        return response;
    }
    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let mut response = Response::new(Full::new(Bytes::from(bytes)));
            *response.status_mut() = StatusCode::OK;
            response.headers_mut().insert(
                CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            response
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => empty(StatusCode::NOT_FOUND),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn put(inner: &Inner, key: &str, request: Request<Incoming>) -> Response<Full<Bytes>> {
    let Ok(target) = inner.repository.path(key) else {
        return empty(StatusCode::NOT_FOUND);
    };
    if target.is_dir() {
        return empty(StatusCode::CONFLICT);
    }
    if let Some(parent) = target.parent() {
        if tokio::fs::create_dir_all(parent).await.is_err() {
            return empty(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }
    let temporary = target.with_file_name(format!(".upload-{}", uuid::Uuid::new_v4().simple()));
    let mut file = match tokio::fs::File::create(&temporary).await {
        Ok(file) => file,
        Err(_) => return empty(StatusCode::INTERNAL_SERVER_ERROR),
    };
    let mut body = request.into_body();
    let mut written = 0u64;
    loop {
        match body.frame().await {
            Some(Ok(frame)) => {
                if let Some(data) = frame.data_ref() {
                    written += data.len() as u64;
                    if written > MAX_BODY {
                        drop(file);
                        let _ = tokio::fs::remove_file(&temporary).await;
                        return empty(StatusCode::PAYLOAD_TOO_LARGE);
                    }
                    if file.write_all(data).await.is_err() {
                        drop(file);
                        let _ = tokio::fs::remove_file(&temporary).await;
                        return empty(StatusCode::INTERNAL_SERVER_ERROR);
                    }
                }
            }
            Some(Err(_)) => {
                drop(file);
                let _ = tokio::fs::remove_file(&temporary).await;
                return empty(StatusCode::BAD_REQUEST);
            }
            None => break,
        }
    }
    if file.sync_all().await.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
        return empty(StatusCode::INTERNAL_SERVER_ERROR);
    }
    drop(file);
    match tokio::fs::rename(&temporary, &target).await {
        Ok(()) => empty(StatusCode::CREATED),
        Err(_) => {
            let _ = tokio::fs::remove_file(&temporary).await;
            empty(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn mkcol(inner: &Inner, key: &str) -> Response<Full<Bytes>> {
    let Ok(target) = inner.repository.path(key) else {
        return empty(StatusCode::CONFLICT);
    };
    if tokio::fs::metadata(&target).await.is_ok() {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    match tokio::fs::create_dir_all(&target).await {
        Ok(()) => empty(StatusCode::CREATED),
        Err(_) => empty(StatusCode::CONFLICT),
    }
}

async fn delete(inner: &Inner, key: &str) -> Response<Full<Bytes>> {
    let Ok(target) = inner.repository.path(key) else {
        return empty(StatusCode::NOT_FOUND);
    };
    match tokio::fs::metadata(&target).await {
        Ok(metadata) if metadata.is_dir() => {
            if tokio::fs::remove_dir_all(&target).await.is_ok() {
                empty(StatusCode::NO_CONTENT)
            } else {
                empty(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
        Ok(_) => match tokio::fs::remove_file(&target).await {
            Ok(()) => empty(StatusCode::NO_CONTENT),
            Err(error) if error.kind() == io::ErrorKind::NotFound => empty(StatusCode::NOT_FOUND),
            Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => empty(StatusCode::NOT_FOUND),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn mv(inner: &Inner, source_key: &str, request: &Request<Incoming>) -> Response<Full<Bytes>> {
    let Some(destination) = request
        .headers()
        .get("destination")
        .and_then(|value| value.to_str().ok())
    else {
        return empty(StatusCode::BAD_REQUEST);
    };
    let destination_path = match Uri::try_from(destination) {
        Ok(uri) => uri.path().to_string(),
        Err(_) => match destination.strip_prefix('/') {
            Some(path) => format!("/{path}"),
            None => return empty(StatusCode::BAD_REQUEST),
        },
    };
    let Some(destination_key) = route_key(inner, &destination_path) else {
        return empty(StatusCode::BAD_REQUEST);
    };
    let (Ok(source), Ok(target)) = (
        inner.repository.path(source_key),
        inner.repository.path(&destination_key),
    ) else {
        return empty(StatusCode::BAD_REQUEST);
    };
    if tokio::fs::metadata(&source).await.is_err() {
        return empty(StatusCode::NOT_FOUND);
    }
    let overwrite = request
        .headers()
        .get("overwrite")
        .and_then(|value| value.to_str().ok())
        .is_none_or(|value| !value.eq_ignore_ascii_case("F"));
    let existed = tokio::fs::metadata(&target).await.is_ok();
    if existed && !overwrite {
        return empty(StatusCode::PRECONDITION_FAILED);
    }
    if existed && target.is_dir() {
        return empty(StatusCode::CONFLICT);
    }
    if let Some(parent) = target.parent() {
        if tokio::fs::create_dir_all(parent).await.is_err() {
            return empty(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }
    match tokio::fs::rename(&source, &target).await {
        Ok(()) => empty(if existed {
            StatusCode::NO_CONTENT
        } else {
            StatusCode::CREATED
        }),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn propfind(inner: &Inner, key: &str, request: &Request<Incoming>) -> Response<Full<Bytes>> {
    let Ok(target) = inner.repository.path(key) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(metadata) = tokio::fs::metadata(&target).await else {
        return empty(StatusCode::NOT_FOUND);
    };
    let depth = request
        .headers()
        .get("depth")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("1");
    let mut body =
        String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?><D:multistatus xmlns:D=\"DAV:\">");
    response_entry(&mut body, inner, key, metadata.is_dir());
    if metadata.is_dir() && depth != "0" {
        if let Ok(mut entries) = tokio::fs::read_dir(&target).await {
            let mut names = Vec::new();
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Some(name) = entry.file_name().to_str() {
                    if !name.starts_with('.') {
                        names.push(name.to_string());
                    }
                }
            }
            names.sort();
            for name in names {
                let child = if key.is_empty() {
                    name
                } else {
                    format!("{key}/{name}")
                };
                let Ok(path) = inner.repository.path(&child) else {
                    continue;
                };
                if let Ok(metadata) = tokio::fs::metadata(&path).await {
                    response_entry(&mut body, inner, &child, metadata.is_dir());
                }
            }
        }
    }
    body.push_str("</D:multistatus>");
    let mut response = Response::new(Full::new(Bytes::from(body)));
    *response.status_mut() = StatusCode::MULTI_STATUS;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/xml; charset=utf-8"),
    );
    response
}

fn response_entry(body: &mut String, inner: &Inner, key: &str, collection: bool) {
    body.push_str("<D:response><D:href>");
    body.push_str(&href(inner.repository.id(), key, collection));
    body.push_str("</D:href><D:propstat><D:prop><D:resourcetype>");
    if collection {
        body.push_str("<D:collection/>");
    }
    body.push_str(
        "</D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>",
    );
}

fn href(repo_id: &str, key: &str, collection: bool) -> String {
    let mut href = format!("/hub/{repo_id}");
    if key.is_empty() {
        return format!("{href}/");
    }
    for segment in key.split('/') {
        href.push('/');
        href.push_str(&utf8_percent_encode(segment, NON_ALPHANUMERIC).to_string());
    }
    if collection {
        href.push('/');
    }
    xml_escape(&href)
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

async fn read_limited(mut body: Incoming, limit: usize) -> Result<Vec<u8>, StatusCode> {
    let mut bytes = Vec::new();
    while let Some(frame) = body.frame().await {
        let frame = frame.map_err(|_| StatusCode::BAD_REQUEST)?;
        if let Some(data) = frame.data_ref() {
            if bytes.len() + data.len() > limit {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }
            bytes.extend_from_slice(data);
        }
    }
    Ok(bytes)
}

fn empty(status: StatusCode) -> Response<Full<Bytes>> {
    let mut response = Response::new(Full::new(Bytes::new()));
    *response.status_mut() = status;
    response
}

fn unauthorized() -> Response<Full<Bytes>> {
    let mut response = empty(StatusCode::UNAUTHORIZED);
    response.headers_mut().insert(
        WWW_AUTHENTICATE,
        HeaderValue::from_static("Basic realm=\"Textus Hub\""),
    );
    response
}

fn method_not_allowed(allow: &'static str) -> Response<Full<Bytes>> {
    let mut response = empty(StatusCode::METHOD_NOT_ALLOWED);
    response
        .headers_mut()
        .insert(ALLOW, HeaderValue::from_static(allow));
    response
}

fn json(status: StatusCode, value: &impl Serialize) -> Response<Full<Bytes>> {
    let body = serde_json::to_vec(value).unwrap_or_default();
    let mut response = Response::new(Full::new(Bytes::from(body)));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
