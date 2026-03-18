use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub file_type: String,
    pub size: u64,
    pub modified_at: String,
    pub tags: Vec<String>,
}

pub const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif", "gif", "heic", "heif",
];
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v"];

pub fn classify_file(path: &Path) -> Option<&'static str> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    match ext.as_deref() {
        Some(e) if IMAGE_EXTENSIONS.contains(&e) => Some("image"),
        Some(e) if VIDEO_EXTENSIONS.contains(&e) => Some("video"),
        _ => None,
    }
}

/// Scan a folder, upsert found files into DB, and return all files in that folder.
pub fn scan_and_store(db_state: &DbState, folder: &str) -> Result<Vec<FileEntry>, String> {
    let folder_path = Path::new(folder);
    if !folder_path.is_dir() {
        return Err(format!("Not a directory: {folder}"));
    }

    let conn = db_state.0.lock().map_err(|e| e.to_string())?;

    for entry in WalkDir::new(folder_path)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let Some(file_type) = classify_file(path) else {
            continue;
        };

        let path_str = path.to_string_lossy().to_string();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let meta = std::fs::metadata(path).ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| {
                let secs = d.as_secs() as i64;
                chrono::DateTime::from_timestamp(secs, 0)
                    .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
                    .unwrap_or_else(|| "1970-01-01T00:00:00".to_string())
            })
            .unwrap_or_else(|| "1970-01-01T00:00:00".to_string());

        conn.execute(
            "INSERT INTO files (path, name, file_type, size, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(path) DO UPDATE SET
               name        = excluded.name,
               file_type   = excluded.file_type,
               size        = excluded.size,
               modified_at = excluded.modified_at,
               scanned_at  = datetime('now')",
            params![path_str, name, file_type, size as i64, modified_at],
        )
        .map_err(|e| e.to_string())?;
    }

    get_files_in_folder(&conn, folder)
}

/// Retrieve files in a specific folder from DB.
pub fn get_files_in_folder(conn: &rusqlite::Connection, folder: &str) -> Result<Vec<FileEntry>, String> {
    let folder_normalized = if folder.ends_with('/') || folder.ends_with('\\') {
        folder.to_string()
    } else {
        format!("{}/", folder)
    };

    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.path, f.name, f.file_type, f.size, f.modified_at,
                    GROUP_CONCAT(t.name, ',') as tags
             FROM files f
             LEFT JOIN file_tags ft ON ft.file_id = f.id
             LEFT JOIN tags t ON t.id = ft.tag_id
             WHERE f.path LIKE ?1
               AND f.path NOT LIKE ?2
             GROUP BY f.id
             ORDER BY f.name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;

    let sep = if cfg!(windows) { '\\' } else { '/' };
    let pattern = format!("{}{}%", folder_normalized.trim_end_matches(['/', '\\']), sep);
    let anti_pattern = format!("{}{}%{}%{}%", folder_normalized.trim_end_matches(['/', '\\']), sep, sep, sep);

    let rows = stmt
        .query_map(params![pattern, anti_pattern], |row| {
            let tags_str: Option<String> = row.get(6)?;
            Ok(FileEntry {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                file_type: row.get(3)?,
                size: row.get::<_, i64>(4)? as u64,
                modified_at: row.get(5)?,
                tags: tags_str
                    .map(|s| s.split(',').map(|t| t.to_string()).collect())
                    .unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
