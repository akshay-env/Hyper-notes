// Shared helpers: path joining + time. Vault-relative paths look like
// "/Projects/Note.md"; abs() joins them onto the absolute vault root.
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Absolute filesystem path for a vault-relative path under `root`.
pub fn abs(root: &str, rel: &str) -> PathBuf {
    Path::new(root).join(rel.trim_start_matches('/'))
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
