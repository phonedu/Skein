//! S3 transport, signed with SigV4. Path-style (the form Bitiful and
//! Qiniu accept) and virtual-hosted style are both built here; conditional
//! create is the standard `If-None-Match: *` PUT, so OSS needs its own
//! `x-oss-forbid-overwrite` adapter later.

use crate::chunk::hash_hex;
use crate::error::{Result, SyncError};
use crate::store::ObjectStore;
use async_trait::async_trait;
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Response, StatusCode, Url};
use sha2::Sha256;
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

pub struct S3Store {
    client: Client,
    endpoint: Url,
    bucket: String,
    prefix: String,
    region: String,
    access_key: String,
    secret_key: String,
    path_style: bool,
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
    ) -> Result<Self> {
        let mut endpoint = Url::parse(endpoint).map_err(|_| SyncError::new("invalidConfig"))?;
        if !matches!(endpoint.scheme(), "http" | "https") || endpoint.host_str().is_none() {
            return Err(SyncError::new("invalidConfig"));
        }
        endpoint.set_query(None);
        endpoint.set_fragment(None);
        if bucket.is_empty() || region.is_empty() {
            return Err(SyncError::new("invalidConfig"));
        }
        Ok(Self {
            client: Client::builder()
                .build()
                .map_err(|_| SyncError::new("networkError"))?,
            endpoint,
            bucket: bucket.to_string(),
            prefix: prefix.trim_matches('/').to_string(),
            region: region.to_string(),
            access_key: access_key.to_string(),
            secret_key: secret_key.to_string(),
            path_style,
        })
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

    async fn send(
        &self,
        method: Method,
        key: &str,
        body: Option<Vec<u8>>,
        extra: BTreeMap<String, String>,
    ) -> Result<Response> {
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
        for (name, value) in extra {
            headers.insert(name.to_ascii_lowercase(), value);
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
            HeaderValue::from_str(&authorization).map_err(|_| SyncError::new("invalidConfig"))?,
        );
        let mut request = self.client.request(method, url).headers(request_headers);
        if let Some(body) = body {
            request = request.body(body);
        }
        request
            .send()
            .await
            .map_err(|_| SyncError::new("networkError"))
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
        let response = self.send(Method::GET, key, None, BTreeMap::new()).await?;
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
        let response = self.send(Method::HEAD, key, None, BTreeMap::new()).await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        if !response.status().is_success() {
            return Err(Self::refused(response.status()));
        }
        Ok(true)
    }

    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        let response = self
            .send(Method::PUT, key, Some(bytes), BTreeMap::new())
            .await?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(Self::refused(response.status()))
        }
    }

    async fn create(&self, key: &str, bytes: Vec<u8>) -> Result<bool> {
        let mut extra = BTreeMap::new();
        extra.insert("if-none-match".to_string(), "*".to_string());
        let response = self.send(Method::PUT, key, Some(bytes), extra).await?;
        if response.status() == StatusCode::PRECONDITION_FAILED
            || (response.status() == StatusCode::CONFLICT && self.has(key).await.unwrap_or(false))
        {
            return Ok(false);
        }
        if response.status().is_success() {
            Ok(true)
        } else {
            Err(Self::refused(response.status()))
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let response = self
            .send(Method::DELETE, key, None, BTreeMap::new())
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
    fn path_style_and_virtual_host_build_the_expected_urls() {
        let path = S3Store::new(
            "https://s3.example.com",
            "bucket",
            "a b",
            "cn-east-1",
            "ak",
            "sk",
            true,
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
        )
        .unwrap();
        assert_eq!(
            hosted.url_for("v1/head.json").unwrap().as_str(),
            "https://bucket.s3.example.com/notes/v1/head.json"
        );
    }
}
