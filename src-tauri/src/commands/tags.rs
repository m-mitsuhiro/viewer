use crate::db::DbState;
use crate::tag_store::{self, Tag};
use tauri::State;

#[tauri::command]
pub fn get_all_tags(db: State<'_, DbState>) -> Result<Vec<Tag>, String> {
    tag_store::get_all_tags(db.inner())
}

#[tauri::command]
pub fn get_file_tags(db: State<'_, DbState>, path: String) -> Result<Vec<String>, String> {
    tag_store::get_file_tags(db.inner(), &path)
}

#[tauri::command]
pub fn add_tag(db: State<'_, DbState>, path: String, tag: String) -> Result<(), String> {
    tag_store::add_tag(db.inner(), &path, &tag)
}

#[tauri::command]
pub fn remove_tag(db: State<'_, DbState>, path: String, tag: String) -> Result<(), String> {
    tag_store::remove_tag(db.inner(), &path, &tag)
}

#[tauri::command]
pub fn search_by_tags(db: State<'_, DbState>, tags: Vec<String>) -> Result<Vec<String>, String> {
    tag_store::search_by_tags(db.inner(), &tags)
}
