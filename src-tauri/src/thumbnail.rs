use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::imageops::FilterType;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub struct ThumbnailCache {
    pub dir: PathBuf,
}

const THUMB_SIZE: u32 = 256;

static VIDEO_EXTS: &[&str] = &["mp4", "m4v", "mov", "mkv", "avi", "wmv", "webm", "flv", "ts"];

fn is_video(file_path: &str) -> bool {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    VIDEO_EXTS.contains(&ext.as_str())
}

/// Returns base64-encoded JPEG thumbnail from disk cache only (no generation).
pub fn get_cached(cache_dir: &Path, file_path: &str) -> Result<String, String> {
    let cache_path = cache_dir.join(cache_key(file_path));
    let src_path = Path::new(file_path);
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
    Err("not cached".into())
}

/// Saves pre-generated JPEG bytes (base64) to the disk cache.
pub fn save_to_cache(cache_dir: &Path, file_path: &str, jpeg_b64: &str) -> Result<(), String> {
    let bytes = BASE64.decode(jpeg_b64).map_err(|e| e.to_string())?;
    let cache_path = cache_dir.join(cache_key(file_path));
    std::fs::write(&cache_path, &bytes).map_err(|e| e.to_string())
}

/// Returns base64-encoded JPEG thumbnail.
/// Checks disk cache first; generates and caches if missing.
/// Dispatches to image or video generation based on file extension.
pub fn get_or_generate(cache_dir: &Path, file_path: &str) -> Result<String, String> {
    let src_path = Path::new(file_path);
    let cache_path = cache_dir.join(cache_key(file_path));

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

    let bytes = if is_video(file_path) {
        generate_video_thumbnail(file_path)?
    } else {
        generate_image_thumbnail(file_path)?
    };

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

#[cfg(target_os = "windows")]
fn generate_video_thumbnail(file_path: &str) -> Result<Vec<u8>, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::{Interface, PCWSTR},
        Win32::{
            Foundation::SIZE,
            Graphics::Gdi::{
                CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, SelectObject,
                BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
            },
            System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_RESIZETOFIT},
        },
    };

    let wide: Vec<u16> = std::ffi::OsStr::new(file_path)
        .encode_wide()
        .chain(Some(0))
        .collect();

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let result = (|| -> Result<Vec<u8>, String> {
            let shell_item: windows::Win32::UI::Shell::IShellItem =
                SHCreateItemFromParsingName(PCWSTR::from_raw(wide.as_ptr()), None)
                    .map_err(|e| e.to_string())?;

            let factory: IShellItemImageFactory =
                shell_item.cast::<IShellItemImageFactory>().map_err(|e: windows::core::Error| e.to_string())?;

            let sz = SIZE {
                cx: THUMB_SIZE as i32,
                cy: THUMB_SIZE as i32,
            };
            let hbitmap = factory
                .GetImage(sz, SIIGBF_RESIZETOFIT)
                .map_err(|e: windows::core::Error| e.to_string())?;

            // Get bitmap dimensions via BITMAP struct
            let mut bmp_obj = windows::Win32::Graphics::Gdi::BITMAP::default();
            windows::Win32::Graphics::Gdi::GetObjectW(
                hbitmap,
                std::mem::size_of_val(&bmp_obj) as i32,
                Some(&mut bmp_obj as *mut _ as *mut std::ffi::c_void),
            );
            let w = bmp_obj.bmWidth.unsigned_abs();
            let h = bmp_obj.bmHeight.unsigned_abs();
            if w == 0 || h == 0 {
                let _ = DeleteObject(hbitmap);
                return Err("empty bitmap".into());
            }

            let dc = CreateCompatibleDC(None);
            let old = SelectObject(dc, hbitmap);

            let bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w as i32,
                    biHeight: -(h as i32), // top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    biSizeImage: w * h * 4,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut pixels = vec![0u8; (w * h * 4) as usize];
            GetDIBits(
                dc,
                hbitmap,
                0,
                h,
                Some(pixels.as_mut_ptr() as *mut _),
                &bmi as *const _ as *mut _,
                DIB_RGB_COLORS,
            );
            SelectObject(dc, old);
            let _ = DeleteDC(dc);
            let _ = DeleteObject(hbitmap);

            // BGRA → RGBA
            for chunk in pixels.chunks_mut(4) {
                chunk.swap(0, 2);
            }

            let img = image::RgbaImage::from_raw(w, h, pixels)
                .ok_or("Failed to create image buffer")?;
            let rgb = image::DynamicImage::ImageRgba8(img).into_rgb8();
            let mut buf = Vec::new();
            rgb.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
                .map_err(|e| e.to_string())?;
            Ok(buf)
        })();

        CoUninitialize();
        result
    }
}

#[cfg(not(target_os = "windows"))]
fn generate_video_thumbnail(_file_path: &str) -> Result<Vec<u8>, String> {
    Err("Video thumbnails are only supported on Windows".into())
}

fn cache_key(file_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    format!("{:016x}.jpg", hasher.finish())
}
