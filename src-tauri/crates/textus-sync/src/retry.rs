//! The retry rules every transport follows: a request is sent at most four
//! times, a busy server is waited out (Retry-After included), and a lost
//! answer or a gateway is retried only where asking twice changes nothing.
//! The transports decide which of their requests may be repeated; the lock's
//! DELETE and a WebDAV MOVE may not.

use chrono::Utc;
use reqwest::header::RETRY_AFTER;
use reqwest::Response;
use std::time::Duration;

pub(crate) const ATTEMPTS: usize = 4;
/// The longest a server may ask to be left before the sync stops for now.
pub(crate) const LONGEST_WAIT: Duration = Duration::from_secs(60);

/// A pause before sending again: doubling from half a second, give or take
/// a fifth, so requests that met the same busy server spread out.
pub(crate) fn backoff(attempt: usize) -> Duration {
    let base = 500u64.saturating_mul(1u64 << attempt.min(10));
    let nanos = Utc::now().timestamp_subsec_nanos() as u64;
    let factor = 80 + nanos % 41;
    Duration::from_millis(base * factor / 100)
}

/// Retry-After as a wait: seconds, or HTTP's date form.
pub(crate) fn retry_after(response: &Response) -> Duration {
    let Some(value) = response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
    else {
        return Duration::ZERO;
    };
    let value = value.trim();
    if let Ok(seconds) = value.parse::<u64>() {
        return Duration::from_secs(seconds);
    }
    let Some(at) = http_date_ms(value) else {
        return Duration::ZERO;
    };
    Duration::from_millis((at - Utc::now().timestamp_millis()).max(0) as u64)
}

/// An HTTP date in milliseconds since the epoch. IMF-fixdate is the form
/// servers send; the RFC 2822 parser also accepts the older forms.
pub(crate) fn http_date_ms(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(value)
        .ok()
        .map(|at| at.timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_dates_parse() {
        assert_eq!(http_date_ms("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        assert_eq!(
            http_date_ms("Wed, 21 Oct 2015 07:28:00 GMT"),
            Some(1_445_412_480_000)
        );
        assert_eq!(http_date_ms("not a date"), None);
    }

    #[test]
    fn backoff_grows_and_stays_within_its_range() {
        for attempt in 0..ATTEMPTS {
            let wait = backoff(attempt).as_millis() as u64;
            let base = 500u64 << attempt;
            assert!(wait >= base * 80 / 100 && wait <= base * 120 / 100);
        }
    }
}
