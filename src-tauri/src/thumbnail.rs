use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::imageops::FilterType;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub struct ThumbnailCache {
    pub dir: PathBuf,
}

const THUMB_SIZE: u32 = 256;

/// Returns base64-encoded JPEG thumbnail (synchronous).
/// Checks disk cache first; generates and caches if missing.
pub fn get_or_generate(cache_dir: &Path, file_path: &str) -> Result<String, String> {
    let src_path = Path::new(file_path);
    let cache_path = cache_dir.join(cache_key(file_path));

    // Check cache validity against source file's modification time
    if let (Ok(cache_meta), Ok(src_meta)) =
        (std::fs::metadata(&cache_path), std::fs::metadata(src_path))
    {
        let fresh = cache_meta
            .modified()
            .ok()
            .zip(src_meta.modified().ok())
            .map(|(c, s)| c >= s)
            .unwrap_or(false);

        if fresh {
            if let Ok(bytes) = std::fs::read(&cache_path) {
                return Ok(BASE64.encode(&bytes));
            }
        }
    }

    // Generate thumbnail
    let bytes = generate_image_thumbnail(file_path)?;

    // Write to cache (best-effort)
    let _ = std::fs::write(&cache_path, &bytes);

    Ok(BASE64.encode(&bytes))
}

fn generate_image_thumbnail(file_path: &str) -> Result<Vec<u8>, String> {
    let img = image::open(file_path).map_err(|e| format!("Failed to open image: {e}"))?;
    let thumbnail = img.resize(THUMB_SIZE, THUMB_SIZE, FilterType::Lanczos3);

    let mut buf = Vec::new();
    thumbnail
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode thumbnail: {e}"))?;

    Ok(buf)
}

fn cache_key(file_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    format!("{:016x}.jpg", hasher.finish())
}
