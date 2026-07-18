// Recycle bin on disk: deleted items are moved into "<root>/.bin/<id>__<name>"
// and tracked in "<root>/.bin/index.json". Restore moves the item back (to a
// collision-free name) and returns its rebuilt subtree + docs so the frontend can
// re-insert it. ".bin" starts with '.' so read_vault skips it.
use super::util::{abs, now_ms};
use super::vault::{node_for, Node};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct BinEntry {
    id: String,
    name: String,
    #[serde(rename = "originalPath")]
    original_path: String, // vault-relative path it lived at
    #[serde(rename = "isFolder")]
    is_folder: bool,
    #[serde(rename = "deletedAt")]
    deleted_at: u64, // ms since epoch
}

#[derive(Serialize)]
pub struct RestoreResult {
    #[serde(rename = "originalPath")]
    original_path: String,
    node: Node,
    docs: BTreeMap<String, String>,
}

fn bin_dir(root: &str) -> PathBuf {
    Path::new(root).join(".bin")
}
fn index_path(dir: &Path) -> PathBuf {
    dir.join("index.json")
}
fn stored_path(dir: &Path, entry: &BinEntry) -> PathBuf {
    dir.join(format!("{}__{}", entry.id, entry.name))
}

fn read_index(dir: &Path) -> Vec<BinEntry> {
    std::fs::read_to_string(index_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn write_index(dir: &Path, idx: &[BinEntry]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let s = serde_json::to_string_pretty(idx).map_err(|e| e.to_string())?;
    std::fs::write(index_path(dir), s).map_err(|e| e.to_string())
}

/// A vault-relative path that doesn't yet exist: `rel`, then "name 2.md", etc.
fn unique_rel(root: &str, rel: &str) -> String {
    if !abs(root, rel).exists() {
        return rel.to_string();
    }
    let ext = Path::new(rel).extension().and_then(|e| e.to_str());
    let stem = match ext {
        Some(e) => &rel[..rel.len() - e.len() - 1], // strip ".ext"
        None => rel,
    };
    for i in 2..10_000 {
        let candidate = match ext {
            Some(e) => format!("{} {}.{}", stem, i, e),
            None => format!("{} {}", stem, i),
        };
        if !abs(root, &candidate).exists() {
            return candidate;
        }
    }
    rel.to_string()
}

/// Move a file/folder into the bin under the caller-provided `id` (so the
/// frontend and the on-disk index share the same key). Returns the entry.
#[tauri::command]
pub fn move_to_bin(root: String, rel: String, id: String) -> Result<BinEntry, String> {
    let src = abs(&root, &rel);
    let name = Path::new(&rel)
        .file_name()
        .ok_or_else(|| "invalid path".to_string())?
        .to_string_lossy()
        .to_string();
    let is_folder = src.is_dir();
    let dir = bin_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let entry = BinEntry {
        id,
        name,
        original_path: rel,
        is_folder,
        deleted_at: now_ms(),
    };
    std::fs::rename(&src, stored_path(&dir, &entry)).map_err(|e| e.to_string())?;

    let mut idx = read_index(&dir);
    idx.insert(0, entry.clone());
    write_index(&dir, &idx)?;
    Ok(entry)
}

/// The current bin contents (newest first).
#[tauri::command]
pub fn list_bin(root: String) -> Result<Vec<BinEntry>, String> {
    Ok(read_index(&bin_dir(&root)))
}

/// Restore an entry to the vault (original location if free, else a numbered
/// variant) and return its rebuilt subtree + docs.
#[tauri::command]
pub fn restore_bin(root: String, id: String) -> Result<RestoreResult, String> {
    let dir = bin_dir(&root);
    let mut idx = read_index(&dir);
    let pos = idx
        .iter()
        .position(|e| e.id == id)
        .ok_or_else(|| "bin entry not found".to_string())?;
    let entry = idx.remove(pos);

    let target_rel = unique_rel(&root, &entry.original_path);
    let target = abs(&root, &target_rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(stored_path(&dir, &entry), &target).map_err(|e| e.to_string())?;
    write_index(&dir, &idx)?;

    let mut docs = BTreeMap::new();
    let node = node_for(&root, &target_rel, &mut docs).map_err(|e| e.to_string())?;
    Ok(RestoreResult { original_path: target_rel, node, docs })
}

/// Permanently remove a single bin entry.
#[tauri::command]
pub fn delete_bin(root: String, id: String) -> Result<(), String> {
    let dir = bin_dir(&root);
    let mut idx = read_index(&dir);
    if let Some(pos) = idx.iter().position(|e| e.id == id) {
        let entry = idx.remove(pos);
        let p = stored_path(&dir, &entry);
        let _ = if entry.is_folder {
            std::fs::remove_dir_all(&p)
        } else {
            std::fs::remove_file(&p)
        };
        write_index(&dir, &idx)?;
    }
    Ok(())
}

/// Permanently empty the bin.
#[tauri::command]
pub fn empty_bin(root: String) -> Result<(), String> {
    let dir = bin_dir(&root);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
