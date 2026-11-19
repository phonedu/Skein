//! Errors that reach the UI as a key plus arguments, like the plugin's
//! `SyncError` (`host.ts`'s `fail`). The wording lives in the app's locales.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncError {
    pub code: &'static str,
    pub args: Vec<String>,
}

impl SyncError {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            args: Vec::new(),
        }
    }

    pub fn with_args(code: &'static str, args: impl IntoIterator<Item = String>) -> Self {
        Self {
            code,
            args: args.into_iter().collect(),
        }
    }
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)?;
        for arg in &self.args {
            write!(f, " {arg}")?;
        }
        Ok(())
    }
}

impl std::error::Error for SyncError {}

pub type Result<T> = std::result::Result<T, SyncError>;
