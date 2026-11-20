//! WebDAV transport. Writes use the plugin's portable create: PUT a unique
//! temporary object, then MOVE it with `Overwrite: F`; a refused MOVE to an
//! existing name means the object was already there.

use crate::error::{Result, SyncError};
use crate::store::ObjectStore;
use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Response, StatusCode, Url};
use std::collections::HashSet;
use std::sync::Mutex;
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
        if endpoint.scheme() == "http"
            && !matches!(
                endpoint.host_str().unwrap_or_default(),
                "localhost" | "127.0.0.1" | "::1"
            )
        {
            // Basic auth and sync payloads do not travel in clear text.
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
    ) -> Result<Response> {
        self.send_url(method, self.url_for(key)?, body, headers)
            .await
    }

    async fn send_url(
        &self,
        method: Method,
        url: Url,
        body: Option<Vec<u8>>,
        headers: HeaderMap,
    ) -> Result<Response> {
        let mut request = self
            .client
            .request(method, url)
            .basic_auth(&self.username, Some(&self.password))
            .headers(headers);
        if let Some(body) = body {
            request = request.body(body);
        }
        request
            .send()
            .await
            .map_err(|_| SyncError::new("networkError"))
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
        let response = self.send(Method::GET, key, None, HeaderMap::new()).await?;
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
        let response = self.send(Method::HEAD, key, None, HeaderMap::new()).await?;
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
            .send(Method::PUT, key, Some(bytes), HeaderMap::new())
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
        let response = self
            .send(Method::DELETE, key, None, HeaderMap::new())
            .await?;
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
}
