use exif::{In, Reader as ExifReader, Tag};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: String,
    pub created_at: String,
    // Image-specific
    pub width: Option<u32>,
    pub height: Option<u32>,
    // EXIF
    pub captured_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub iso: Option<u32>,
    pub focal_length: Option<String>,
    pub aperture: Option<String>,
    pub shutter_speed: Option<String>,
    pub gps_lat: Option<f64>,
    pub gps_lon: Option<f64>,
}

pub fn read_metadata(file_path: &str) -> Result<FileMetadata, String> {
    let path = Path::new(file_path);

    let fs_meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let size = fs_meta.len();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let to_datetime = |st: std::time::SystemTime| {
        st.duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|d| {
                chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                    .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
            })
            .unwrap_or_else(|| "1970-01-01T00:00:00".to_string())
    };

    let modified_at = fs_meta
        .modified()
        .map(to_datetime)
        .unwrap_or_else(|_| "1970-01-01T00:00:00".to_string());

    let created_at = fs_meta
        .created()
        .map(to_datetime)
        .unwrap_or_else(|_| "1970-01-01T00:00:00".to_string());

    let mut meta = FileMetadata {
        path: file_path.to_string(),
        name,
        size,
        modified_at,
        created_at,
        width: None,
        height: None,
        captured_at: None,
        camera_make: None,
        camera_model: None,
        lens_model: None,
        iso: None,
        focal_length: None,
        aperture: None,
        shutter_speed: None,
        gps_lat: None,
        gps_lon: None,
    };

    // Try to read EXIF
    if let Ok(file) = File::open(path) {
        let mut reader = BufReader::new(&file);
        if let Ok(exif) = ExifReader::new().read_from_container(&mut reader) {
            macro_rules! get_str {
                ($tag:expr) => {
                    exif.get_field($tag, In::PRIMARY)
                        .map(|f| f.display_value().with_unit(&exif).to_string())
                };
            }

            meta.captured_at = get_str!(Tag::DateTimeOriginal)
                .or_else(|| get_str!(Tag::DateTime));
            meta.camera_make = get_str!(Tag::Make);
            meta.camera_model = get_str!(Tag::Model);
            meta.lens_model = get_str!(Tag::LensModel);
            meta.focal_length = get_str!(Tag::FocalLength);
            meta.aperture = get_str!(Tag::FNumber);
            meta.shutter_speed = get_str!(Tag::ExposureTime);

            meta.iso = exif
                .get_field(Tag::PhotographicSensitivity, In::PRIMARY)
                .and_then(|f| f.value.get_uint(0));

            meta.width = exif
                .get_field(Tag::PixelXDimension, In::PRIMARY)
                .and_then(|f| f.value.get_uint(0));

            meta.height = exif
                .get_field(Tag::PixelYDimension, In::PRIMARY)
                .and_then(|f| f.value.get_uint(0));

            // GPS
            let lat = parse_gps_coord(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef);
            let lon = parse_gps_coord(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef);
            meta.gps_lat = lat;
            meta.gps_lon = lon;
        }
    }

    // Fallback image dimensions
    if meta.width.is_none() || meta.height.is_none() {
        if let Ok(reader) = image::ImageReader::open(path) {
            if let Ok((w, h)) = reader.into_dimensions() {
                meta.width = Some(w);
                meta.height = Some(h);
            }
        }
    }

    Ok(meta)
}

fn parse_gps_coord(exif: &exif::Exif, coord_tag: Tag, ref_tag: Tag) -> Option<f64> {
    let coord = exif.get_field(coord_tag, In::PRIMARY)?;
    let ref_val = exif
        .get_field(ref_tag, In::PRIMARY)
        .map(|f| f.display_value().to_string())
        .unwrap_or_default();

    if let exif::Value::Rational(ref vals) = coord.value {
        if vals.len() >= 3 {
            let deg = vals[0].to_f64();
            let min = vals[1].to_f64();
            let sec = vals[2].to_f64();
            let mut dd = deg + min / 60.0 + sec / 3600.0;
            if ref_val.contains('S') || ref_val.contains('W') {
                dd = -dd;
            }
            return Some(dd);
        }
    }
    None
}
