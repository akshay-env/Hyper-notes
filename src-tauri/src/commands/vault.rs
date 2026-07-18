// Vault filesystem commands. The tree + note contents are read in one pass on
// open (mirrors the frontend's mock model: one payload, then everything is in
// memory). All paths returned are vault-relative ("/Projects/Note.md").
use super::util::abs;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Serialize)]
pub struct Node {
    name: String,
    path: String, // vault-relative
    #[serde(rename = "isFolder")]
    is_folder: bool,
    children: Vec<Node>,
}

#[derive(Serialize)]
pub struct VaultData {
    tree: Vec<Node>,
    docs: BTreeMap<String, String>, // vault-relative path -> markdown
}

/// Scan a vault into a tree + all note contents. Hidden entries (.bin, .git, …)
/// are skipped; folders sort before files, each alphabetically.
#[tauri::command]
pub fn read_vault(root: String) -> Result<VaultData, String> {
    let mut docs = BTreeMap::new();
    let tree = scan(Path::new(&root), "", &mut docs).map_err(|e| e.to_string())?;
    Ok(VaultData { tree, docs })
}

fn scan(dir: &Path, rel_prefix: &str, docs: &mut BTreeMap<String, String>) -> std::io::Result<Vec<Node>> {
    let mut dirs: Vec<Node> = Vec::new();
    let mut files: Vec<Node> = Vec::new();

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // skip hidden (.bin/.git/.obsidian/…)
        }
        let p = entry.path();
        let rel = format!("{}/{}", rel_prefix, name); // "" -> "/name"; "/a" -> "/a/name"
        if p.is_dir() {
            let children = scan(&p, &rel, docs)?;
            dirs.push(Node { name, path: rel, is_folder: true, children });
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(content) = std::fs::read_to_string(&p) {
                docs.insert(rel.clone(), content);
            }
            files.push(Node { name, path: rel, is_folder: false, children: Vec::new() });
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

/// Build a single node (and, for a folder, its subtree) for the item at `rel`,
/// collecting note contents into `docs`. Used by bin restore.
pub fn node_for(root: &str, rel: &str, docs: &mut BTreeMap<String, String>) -> std::io::Result<Node> {
    let p = abs(root, rel);
    let name = Path::new(rel)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if p.is_dir() {
        let children = scan(&p, rel, docs)?;
        Ok(Node { name, path: rel.to_string(), is_folder: true, children })
    } else {
        if let Ok(content) = std::fs::read_to_string(&p) {
            docs.insert(rel.to_string(), content);
        }
        Ok(Node { name, path: rel.to_string(), is_folder: false, children: Vec::new() })
    }
}

/// Write (or overwrite) a note, creating parent folders as needed.
#[tauri::command]
pub fn write_note(root: String, rel: String, content: String) -> Result<(), String> {
    let p = abs(&root, &rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| e.to_string())
}

/// Create an (empty) folder.
#[tauri::command]
pub fn create_folder(root: String, rel: String) -> Result<(), String> {
    std::fs::create_dir_all(abs(&root, &rel)).map_err(|e| e.to_string())
}

/// Create a note with initial content (parents created as needed).
#[tauri::command]
pub fn create_note(root: String, rel: String, content: String) -> Result<(), String> {
    write_note(root, rel, content)
}

/// Read an arbitrary (non-markdown) file inside the vault — e.g. the graph
/// layout cache at ".hyperlink/graph.json". The resolved path is canonicalized
/// and must stay under the vault root, so "../" traversal can't escape it.
#[tauri::command]
pub fn read_file(root: String, rel: String) -> Result<String, String> {
    let root_c = Path::new(&root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let p_c = abs(&root, &rel).canonicalize().map_err(|e| e.to_string())?;
    if !p_c.starts_with(&root_c) {
        return Err("path escapes the vault root".into());
    }
    std::fs::read_to_string(&p_c).map_err(|e| e.to_string())
}

/// Rename/move a file or folder within the vault.
#[tauri::command]
pub fn rename_path(root: String, old_rel: String, new_rel: String) -> Result<(), String> {
    let from = abs(&root, &old_rel);
    let to = abs(&root, &new_rel);
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}
