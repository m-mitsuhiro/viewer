use crate::db::DbState;
use crate::file_scanner::{self, FileEntry};
use crate::metadata::{self, FileMetadata};
use crate::thumbnail::ThumbnailCache;
use tauri::State;

/// Scan a folder and return all media files found.
#[tauri::command]
pub fn scan_folder(db: State<'_, DbState>, path: String) -> Result<Vec<FileEntry>, String> {
    file_scanner::scan_and_store(db.inner(), &path)
}

/// Get files in a folder (from DB cache, no re-scan).
#[tauri::command]
pub fn get_files(
    db: State<'_, DbState>,
    folder: String,
    search: Option<String>,
    file_type_filter: Option<String>,
    tag_filter: Option<Vec<String>>,
) -> Result<Vec<FileEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT f.id, f.path, f.name, f.file_type, f.size, f.modified_at,
                GROUP_CONCAT(t.name, ',') as tags
         FROM files f
         LEFT JOIN file_tags ft ON ft.file_id = f.id
         LEFT JOIN tags t ON t.id = ft.tag_id
         WHERE (f.path LIKE ?1 AND f.path NOT LIKE ?2)",
    );

    let sep = if cfg!(windows) { '\\' } else { '/' };
    let folder_trimmed = folder.trim_end_matches(['/', '\\']).to_string();
    let pattern = format!("{}{sep}%", folder_trimmed);
    let anti_pattern = format!("{}{sep}%{sep}%", folder_trimmed);

    if let Some(ref s) = search {
        if !s.is_empty() {
            sql.push_str(" AND f.name LIKE '%' || ?3 || '%'");
        }
    }

    if let Some(ref ft) = file_type_filter {
        if ft == "image" || ft == "video" {
            sql.push_str(&format!(" AND f.file_type = '{ft}'"));
        }
    }

    sql.push_str(" GROUP BY f.id");

    if let Some(ref tags) = tag_filter {
        if !tags.is_empty() {
            let n = tags.len();
            sql.push_str(&format!(
                " HAVING COUNT(DISTINCT CASE WHEN t.name IN ({}) THEN t.name END) = {n}",
                tags.iter()
                    .map(|t| format!("'{}'", t.replace('\'', "''")))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
    }

    sql.push_str(" ORDER BY f.name COLLATE NOCASE ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let search_val = search.unwrap_or_default();
    let rows = if search_val.is_empty() {
        stmt.query_map(rusqlite::params![pattern, anti_pattern], row_to_entry)
    } else {
        stmt.query_map(
            rusqlite::params![pattern, anti_pattern, search_val],
            row_to_entry,
        )
    }
    .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileEntry> {
    let tags_str: Option<String> = row.get(6)?;
    Ok(FileEntry {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        file_type: row.get(3)?,
        size: row.get::<_, i64>(4)? as u64,
        modified_at: row.get(5)?,
        tags: tags_str
            .map(|s| s.split(',').filter(|t| !t.is_empty()).map(String::from).collect())
            .unwrap_or_default(),
    })
}

/// Get base64-encoded JPEG thumbnail for a file.
#[tauri::command]
pub async fn get_thumbnail(
    cache: State<'_, ThumbnailCache>,
    path: String,
) -> Result<String, String> {
    let dir = cache.dir.clone();
    tokio::task::spawn_blocking(move || crate::thumbnail::get_or_generate(&dir, &path))
        .await
        .map_err(|e| e.to_string())?
}

/// Get file metadata (EXIF + filesystem info).
#[tauri::command]
pub async fn get_metadata(path: String) -> Result<FileMetadata, String> {
    tokio::task::spawn_blocking(move || metadata::read_metadata(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Move file to OS trash/recycle bin.
#[tauri::command]
pub async fn delete_to_trash(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || trash::delete(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Open file's parent folder in Explorer / Finder.
#[tauri::command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let dir = if p.is_dir() {
        p.to_path_buf()
    } else {
        p.parent().map(|p| p.to_path_buf()).unwrap_or(p.to_path_buf())
    };

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
