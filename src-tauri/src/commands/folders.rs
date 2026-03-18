use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
    pub has_children: bool,
}

/// List available drives (Windows) or root directories (Linux/macOS).
#[tauri::command]
pub fn get_drives() -> Vec<FolderEntry> {
    #[cfg(target_os = "windows")]
    {
        ('A'..='Z')
            .map(|c| format!("{c}:\\"))
            .filter(|p| Path::new(p).exists())
            .map(|p| {
                let name = p.clone();
                FolderEntry { has_children: true, path: p, name }
            })
            .collect()
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![FolderEntry {
            path: "/".to_string(),
            name: "/".to_string(),
            has_children: true,
        }]
    }
}

/// List immediate child folders of a given directory.
#[tauri::command]
pub fn get_children(path: String) -> Vec<FolderEntry> {
    let parent = Path::new(&path);
    if !parent.is_dir() {
        return vec![];
    }

    let mut entries: Vec<FolderEntry> = std::fs::read_dir(parent)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .filter(|e| e.path().is_dir())
        .filter(|e| {
            // Skip hidden folders on Unix
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            !name_str.starts_with('.')
        })
        .map(|e| {
            let child_path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            let has_children = std::fs::read_dir(&child_path)
                .map(|mut r| r.any(|e| e.map(|e| e.path().is_dir()).unwrap_or(false)))
                .unwrap_or(false);
            FolderEntry {
                path: child_path.to_string_lossy().to_string(),
                name,
                has_children,
            }
        })
        .collect();

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries
}
