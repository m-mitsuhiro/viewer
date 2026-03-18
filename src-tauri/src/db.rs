use rusqlite::{Connection, Result};
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS files (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            path        TEXT NOT NULL UNIQUE,
            name        TEXT NOT NULL,
            file_type   TEXT NOT NULL CHECK(file_type IN ('image', 'video')),
            size        INTEGER NOT NULL DEFAULT 0,
            modified_at TEXT NOT NULL,
            scanned_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
        CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_at);

        CREATE TABLE IF NOT EXISTS tags (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS file_tags (
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
            PRIMARY KEY (file_id, tag_id)
        );

        CREATE INDEX IF NOT EXISTS idx_file_tags_file ON file_tags(file_id);
        CREATE INDEX IF NOT EXISTS idx_file_tags_tag  ON file_tags(tag_id);
        ",
    )?;

    Ok(())
}
