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

/// Percent-decode a URL-encoded string (handles UTF-8 multi-byte sequences).
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn video_mime(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("mov") => "video/quicktime",
        Some("wmv") => "video/x-ms-wmv",
        _ => "video/mp4",
    }
}

/// Handle localvideo:// requests with Range support.
/// URL format: localvideo://localhost/<percent-encoded absolute path>
fn handle_video_request(
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    use tauri::http::{Response, StatusCode};

    let uri = request.uri().to_string();
    let encoded = uri
        .strip_prefix("localvideo://localhost/")
        .or_else(|| uri.strip_prefix("localvideo://localhost"))
        .unwrap_or(&uri);

    let decoded = url_decode(encoded);
    // On Windows the decoded path starts with /C:/... — strip the leading slash
    #[cfg(target_os = "windows")]
    let file_path = decoded.trim_start_matches('/').to_string();
    #[cfg(not(target_os = "windows"))]
    let file_path = decoded;

    let path = std::path::Path::new(&file_path);

    let file_size = match std::fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("Content-Type", "text/plain")
                .body(b"Not found".to_vec())
                .unwrap()
        }
    };

    let mime = video_mime(path);

    // Parse Range header
    let range_str = request
        .headers()
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    const MAX_CHUNK: u64 = 4 * 1024 * 1024; // 4 MB per chunk

    let (start, requested_end, _is_range) = if let Some(ref r) = range_str {
        if let Some(bytes) = r.strip_prefix("bytes=") {
            let mut parts = bytes.splitn(2, '-');
            let s = parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let e = parts
                .next()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(file_size.saturating_sub(1))
                .min(file_size.saturating_sub(1));
            (s, e, true)
        } else {
            (0, file_size.saturating_sub(1), false)
        }
    } else {
        (0, file_size.saturating_sub(1), false)
    };

    // Cap chunk size to avoid OOM
    let end = requested_end.min(start + MAX_CHUNK - 1).min(file_size.saturating_sub(1));
    let length = (end - start + 1) as usize;

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(vec![])
                .unwrap()
        }
    };

    if file.seek(SeekFrom::Start(start)).is_err() {
        return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(vec![])
            .unwrap();
    }

    let mut buf = vec![0u8; length];
    let mut bytes_read = 0usize;
    while bytes_read < length {
        match file.read(&mut buf[bytes_read..]) {
            Ok(0) => break,
            Ok(n) => bytes_read += n,
            Err(_) => break,
        }
    }
    buf.truncate(bytes_read);

    let actual_end = start + bytes_read as u64 - 1;
    // Always respond with 206 so the browser treats it as streamable
    let status = StatusCode::PARTIAL_CONTENT;

    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Content-Length", bytes_read.to_string())
        .header("Accept-Ranges", "bytes")
        .header(
            "Content-Range",
            format!("bytes {}-{}/{}", start, actual_end, file_size),
        )
        .body(buf)
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("localvideo", |_app, request| {
            handle_video_request(&request)
        })
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
            commands::tags::get_all_tags,
            commands::tags::get_file_tags,
            commands::tags::add_tag,
            commands::tags::remove_tag,
            commands::tags::search_by_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
