//! One sync per vault, and no more than the platform's limit at once.
//! Remote locks still protect the repository across devices; this only
//! keeps one window's runs from piling up.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

#[derive(Default, Clone)]
pub struct SyncRunners {
    active: Arc<Mutex<HashSet<String>>>,
}

#[derive(Debug)]
pub struct RunGuard {
    active: Arc<Mutex<HashSet<String>>>,
    root: String,
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        self.active
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&self.root);
    }
}

impl SyncRunners {
    pub fn enter(&self, root: &str) -> Result<RunGuard, String> {
        let limit = if cfg!(mobile) { 1 } else { 2 };
        self.enter_with(root, limit)
    }

    fn enter_with(&self, root: &str, limit: usize) -> Result<RunGuard, String> {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active.contains(root) {
            return Err("alreadyRunning".to_string());
        }
        if active.len() >= limit {
            return Err("busy".to_string());
        }
        active.insert(root.to_string());
        Ok(RunGuard {
            active: self.active.clone(),
            root: root.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_vault_runs_once_and_the_platform_limit_holds() {
        let runners = SyncRunners::default();
        let first = runners.enter_with("a", 2).unwrap();
        let second = runners.enter_with("b", 2).unwrap();
        assert_eq!(runners.enter_with("c", 2).unwrap_err(), "busy");
        assert_eq!(runners.enter_with("a", 2).unwrap_err(), "alreadyRunning");
        drop(first);
        assert!(runners.enter_with("c", 2).is_ok());
        drop(second);
    }
}
