mod commands;
mod db;
mod file_scanner;
mod metadata;
mod tag_store;
mod tests;
mod thumbnail;

use db::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("viewer.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("Failed to open database");
            db::initialize(&conn).expect("Failed to initialize database");

            let thumbnail_dir = app
                .path()
                .app_cache_dir()
                .expect("Failed to get cache dir")
                .join("thumbnails");
            std::fs::create_dir_all(&thumbnail_dir)?;

            app.manage(DbState(Mutex::new(conn)));
            app.manage(thumbnail::ThumbnailCache { dir: thumbnail_dir });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::folders::get_drives,
            commands::folders::get_children,
            commands::files::scan_folder,
            commands::files::get_files,
            commands::files::get_thumbnail,
            commands::files::get_cached_thumbnail,
            commands::files::save_thumbnail_cache,
            commands::files::get_metadata,
            commands::files::delete_to_trash,
            commands::files::open_in_explorer,
            commands::files::save_frame,
            commands::tags::get_all_tags,
            commands::tags::get_file_tags,
            commands::tags::add_tag,
            commands::tags::remove_tag,
            commands::tags::search_by_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
