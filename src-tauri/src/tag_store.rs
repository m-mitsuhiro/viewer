use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

pub fn get_all_tags(db: &DbState) -> Result<Vec<Tag>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok(Tag { id: row.get(0)?, name: row.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_file_tags(db: &DbState, file_path: &str) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN file_tags ft ON ft.tag_id = t.id
             JOIN files f ON f.id = ft.file_id
             WHERE f.path = ?1
             ORDER BY t.name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![file_path], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())
}

pub fn add_tag(db: &DbState, file_path: &str, tag_name: &str) -> Result<(), String> {
    let tag_name = tag_name.trim().to_string();
    if tag_name.is_empty() {
        return Err("Tag name cannot be empty".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Upsert tag
    conn.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        params![tag_name],
    )
    .map_err(|e| e.to_string())?;

    // Link file to tag
    conn.execute(
        "INSERT OR IGNORE INTO file_tags (file_id, tag_id)
         SELECT f.id, t.id FROM files f, tags t
         WHERE f.path = ?1 AND t.name = ?2",
        params![file_path, tag_name],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn remove_tag(db: &DbState, file_path: &str, tag_name: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM file_tags
         WHERE file_id = (SELECT id FROM files WHERE path = ?1)
           AND tag_id  = (SELECT id FROM tags  WHERE name = ?2)",
        params![file_path, tag_name],
    )
    .map_err(|e| e.to_string())?;

    // Remove orphan tag
    conn.execute(
        "DELETE FROM tags WHERE name = ?1 AND id NOT IN (SELECT DISTINCT tag_id FROM file_tags)",
        params![tag_name],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn search_by_tags(db: &DbState, tags: &[String]) -> Result<Vec<String>, String> {
    if tags.is_empty() {
        return Ok(vec![]);
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let placeholders = tags
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "SELECT DISTINCT f.path FROM files f
         JOIN file_tags ft ON ft.file_id = f.id
         JOIN tags t ON t.id = ft.tag_id
         WHERE t.name IN ({placeholders})
         GROUP BY f.id
         HAVING COUNT(DISTINCT t.name) = {}
         ORDER BY f.name COLLATE NOCASE ASC",
        tags.len()
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_vec: Vec<&dyn rusqlite::ToSql> =
        tags.iter().map(|t| t as &dyn rusqlite::ToSql).collect();

    let rows = stmt
        .query_map(params_vec.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())
}
