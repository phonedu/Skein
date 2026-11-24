//! Pairing from the phone (or any client) without a browser fetch: the app
//! posts the address and one-time code, and receives the device token. The
//! address must be loopback or a private IP; the Hub never publishes.

use reqwest::Url;

fn allowed_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") || host == "::1" || host == "[::1]" {
        return true;
    }
    host.parse::<std::net::Ipv4Addr>()
        .is_ok_and(|address| address.is_private() || address.is_loopback())
}

fn valid_address(address: &str) -> Option<Url> {
    let url = Url::parse(address).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.path().trim_matches('/').is_empty()
        || !allowed_host(&url)
    {
        return None;
    }
    Some(url)
}

fn pair_error(status: reqwest::StatusCode, body: &str) -> String {
    let code = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("error")?.as_str().map(str::to_string));
    match (status.as_u16(), code.as_deref()) {
        (401, Some("invalidCode")) => crate::errors::error("invalidCode"),
        (410, Some("expired")) => crate::errors::error("expired"),
        (429, Some("tooManyAttempts")) => crate::errors::error("tooManyAttempts"),
        _ => crate::errors::error("networkError"),
    }
}

/// Pairs this device with a Hub and returns `{repoId, username, token,
/// readOnly}` as JSON. The token is never logged.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn hub_pair(address: String, code: String, device: String) -> Result<String, String> {
    let address = address.trim().trim_end_matches('/');
    valid_address(address).ok_or_else(|| crate::errors::error("invalidConfig"))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| crate::errors::error("networkError"))?;
    let response = client
        .post(format!("{address}/pair"))
        .json(&serde_json::json!({ "code": code, "device": device }))
        .send()
        .await
        .map_err(|_| crate::errors::error("networkError"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|_| crate::errors::error("networkError"))?;
    if !status.is_success() {
        return Err(pair_error(status, &body));
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_addresses_and_no_path_are_pairing_targets() {
        assert!(valid_address("http://192.168.1.20:7419").is_some());
        assert!(valid_address("http://127.0.0.1:7419").is_some());
        assert!(valid_address("http://localhost:7419").is_some());
        assert!(valid_address("http://8.8.8.8:7419").is_none());
        assert!(valid_address("http://192.168.1.20:7419/hub/x").is_none());
        assert!(valid_address("http://user@192.168.1.20:7419").is_none());
    }

    #[test]
    fn pairing_errors_keep_their_words() {
        assert_eq!(
            pair_error(
                reqwest::StatusCode::UNAUTHORIZED,
                r#"{"error":"invalidCode"}"#
            ),
            crate::errors::error("invalidCode")
        );
        assert_eq!(
            pair_error(reqwest::StatusCode::GONE, r#"{"error":"expired"}"#),
            crate::errors::error("expired")
        );
        assert_eq!(
            pair_error(
                reqwest::StatusCode::TOO_MANY_REQUESTS,
                r#"{"error":"tooManyAttempts"}"#
            ),
            crate::errors::error("tooManyAttempts")
        );
    }
}
