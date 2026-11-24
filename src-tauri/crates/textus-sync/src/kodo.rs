//! Qiniu Kodo's native create. Its S3 endpoint has no conditional PUT, so
//! the lock's "only create if absent" write uses a form upload with an
//! upload token whose policy says `insertOnly`. Reads, overwrites and
//! deletes stay on the S3 endpoint, which this bucket accepts.

use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

/// Qiniu's S3 regions and the upload host each uses. Regions are the ids
/// the S3 endpoint uses (`cn-south-1`), not Kodo's short ids (`z2`); the
/// endpoint signs with one and the uploader routes by the other. The
/// settings page offers exactly this list, so a region it accepts is one
/// this transport can upload to.
pub const REGIONS: [(&str, &str); 8] = [
    ("cn-east-1", "up-z0.qiniup.com"),
    ("cn-east-2", "up-cn-east-2.qiniup.com"),
    ("cn-north-1", "up-z1.qiniup.com"),
    ("cn-south-1", "up-z2.qiniup.com"),
    ("us-north-1", "up-na0.qiniup.com"),
    ("ap-southeast-1", "up-as0.qiniup.com"),
    ("ap-southeast-2", "up-ap-southeast-2.qiniup.com"),
    ("ap-southeast-3", "up-ap-southeast-3.qiniup.com"),
];

/// The upload host for a Qiniu S3 region.
pub fn upload_host(region: &str) -> Option<&'static str> {
    let region = region.to_ascii_lowercase();
    REGIONS
        .iter()
        .find(|(id, _)| *id == region)
        .map(|(_, host)| *host)
}

/// The S3 address for a region. Kodo has no endpoint field in the settings:
/// the region decides the address, so the two cannot disagree.
pub fn s3_endpoint(region: &str) -> String {
    format!("https://s3.{}.qiniucs.com", region.to_ascii_lowercase())
}

/// A put policy that allows one key only and refuses to replace it. The
/// deadline is a Unix timestamp in seconds.
pub fn put_policy(bucket: &str, key: &str, insert_only: bool, deadline: i64) -> String {
    serde_json::json!({
        "scope": format!("{bucket}:{key}"),
        "deadline": deadline,
        "insertOnly": u8::from(insert_only),
    })
    .to_string()
}

pub fn encode_policy(policy: &str) -> String {
    URL_SAFE.encode(policy.as_bytes())
}

/// The token's signature: HMAC-SHA1 over the encoded policy, URL-safe base64.
pub fn sign(secret_key: &str, encoded_policy: &str) -> String {
    let mut mac =
        HmacSha1::new_from_slice(secret_key.as_bytes()).expect("HMAC accepts any key length");
    mac.update(encoded_policy.as_bytes());
    URL_SAFE.encode(mac.finalize().into_bytes())
}

/// `accessKey:sign:encodedPolicy`, the shape the upload host expects.
pub fn upload_token(access_key: &str, secret_key: &str, encoded_policy: &str) -> String {
    format!(
        "{access_key}:{}:{encoded_policy}",
        sign(secret_key, encoded_policy)
    )
}

/// The form body: the token, the full object key, and the bytes. The
/// filename is fixed because Kodo keeps the key, not the part's name.
pub fn multipart(boundary: &str, token: &str, key: &str, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(bytes.len() + 512);
    let mut field = |name: &str, value: &str| {
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            )
            .as_bytes(),
        );
    };
    field("token", token);
    field("key", key);
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"blob\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    // Qiniu's upload-token page: this encoded policy and secret must produce
    // this encoded signature.
    const DOC_POLICY: &str = "eyJzY29wZSI6Im15LWJ1Y2tldDpzdW5mbG93ZXIuanBnIiwiZGVhZGxpbmUiOjE0NTE0OTEyMDAsInJldHVybkJvZHkiOiJ7XCJuYW1lXCI6JChmbmFtZSksXCJzaXplXCI6JChmc2l6ZSksXCJ3XCI6JChpbWFnZUluZm8ud2lkdGgpLFwiaFwiOiQoaW1hZ2VJbmZvLmhlaWdodCksXCJoYXNoXCI6JChldGFnKX0ifQ==";

    #[test]
    fn matches_qinius_token_example() {
        assert_eq!(
            sign("MY_SECRET_KEY", DOC_POLICY),
            "wQ4ofysef1R7IKnrziqtomqyDvI="
        );
    }

    #[test]
    fn a_policy_names_one_key_and_insert_only() {
        let policy = put_policy("bucket", "notes/v1/lock.json", true, 1_451_491_200);
        let value: serde_json::Value = serde_json::from_str(&policy).unwrap();
        assert_eq!(value["scope"], "bucket:notes/v1/lock.json");
        assert_eq!(value["insertOnly"], 1);
        assert_eq!(value["deadline"], 1_451_491_200);
        assert!(put_policy("bucket", "k", false, 1).contains("\"insertOnly\":0"));
    }

    #[test]
    fn a_token_has_three_parts() {
        let policy = put_policy("bucket", "key", true, 1);
        let encoded = encode_policy(&policy);
        let token = upload_token("AK", "SK", &encoded);
        let parts: Vec<&str> = token.split(':').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], "AK");
        assert_eq!(parts[2], encoded);
    }

    #[test]
    fn every_s3_region_has_an_upload_host() {
        for (region, host) in REGIONS {
            assert_eq!(upload_host(region), Some(host));
            assert_eq!(
                s3_endpoint(region),
                format!("https://s3.{region}.qiniucs.com")
            );
        }
        assert_eq!(upload_host("CN-SOUTH-1"), Some("up-z2.qiniup.com"));
        assert_eq!(upload_host("z2"), None);
        assert_eq!(upload_host(""), None);
    }

    #[test]
    fn multipart_carries_token_key_and_bytes() {
        let body = multipart("BOUND", "TOKEN", "notes/a b.md", b"hello");
        let text = String::from_utf8_lossy(&body);
        assert!(text.starts_with("--BOUND\r\n"));
        assert!(text.contains("name=\"token\"\r\n\r\nTOKEN\r\n"));
        assert!(text.contains("name=\"key\"\r\n\r\nnotes/a b.md\r\n"));
        assert!(text.contains("name=\"file\"; filename=\"blob\""));
        assert!(text.contains("\r\n\r\nhello\r\n--BOUND--\r\n"));
    }
}
