#[cfg(test)]
mod file_scanner_tests {
    use crate::file_scanner::classify_file;
    use std::path::Path;

    #[test]
    fn classifies_jpg_as_image() {
        assert_eq!(classify_file(Path::new("photo.jpg")), Some("image"));
        assert_eq!(classify_file(Path::new("photo.JPEG")), Some("image"));
    }

    #[test]
    fn classifies_png_as_image() {
        assert_eq!(classify_file(Path::new("image.png")), Some("image"));
    }

    #[test]
    fn classifies_webp_as_image() {
        assert_eq!(classify_file(Path::new("photo.webp")), Some("image"));
    }

    #[test]
    fn classifies_mp4_as_video() {
        assert_eq!(classify_file(Path::new("video.mp4")), Some("video"));
    }

    #[test]
    fn classifies_mkv_as_video() {
        assert_eq!(classify_file(Path::new("movie.mkv")), Some("video"));
    }

    #[test]
    fn returns_none_for_unknown_extension() {
        assert_eq!(classify_file(Path::new("document.pdf")), None);
        assert_eq!(classify_file(Path::new("archive.zip")), None);
        assert_eq!(classify_file(Path::new("no_extension")), None);
    }

    #[test]
    fn is_case_insensitive() {
        assert_eq!(classify_file(Path::new("photo.JPG")), Some("image"));
        assert_eq!(classify_file(Path::new("video.MP4")), Some("video"));
        assert_eq!(classify_file(Path::new("movie.MKV")), Some("video"));
    }
}

#[cfg(test)]
mod tag_store_tests {
    use crate::db::{initialize, DbState};
    use crate::tag_store;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn setup_db() -> DbState {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        initialize(&conn).expect("initialize");
        // Insert a test file
        conn.execute(
            "INSERT INTO files (path, name, file_type, size, modified_at) VALUES ('/test/a.jpg', 'a.jpg', 'image', 1024, '2024-01-01T00:00:00')",
            [],
        )
        .expect("insert file");
        DbState(Mutex::new(conn))
    }

    #[test]
    fn add_and_get_tag() {
        let db = setup_db();

        tag_store::add_tag(&db, "/test/a.jpg", "vacation").expect("add_tag");

        let tags = tag_store::get_file_tags(&db, "/test/a.jpg").expect("get_file_tags");
        assert_eq!(tags, vec!["vacation"]);
    }

    #[test]
    fn remove_tag_removes_it() {
        let db = setup_db();
        tag_store::add_tag(&db, "/test/a.jpg", "holiday").expect("add_tag");

        tag_store::remove_tag(&db, "/test/a.jpg", "holiday").expect("remove_tag");

        let tags = tag_store::get_file_tags(&db, "/test/a.jpg").expect("get_file_tags");
        assert!(tags.is_empty());
    }

    #[test]
    fn duplicate_tag_is_ignored() {
        let db = setup_db();
        tag_store::add_tag(&db, "/test/a.jpg", "nature").expect("first add");
        tag_store::add_tag(&db, "/test/a.jpg", "nature").expect("second add (no-op)");

        let tags = tag_store::get_file_tags(&db, "/test/a.jpg").expect("get_file_tags");
        assert_eq!(tags.len(), 1);
    }

    #[test]
    fn empty_tag_name_is_rejected() {
        let db = setup_db();
        let result = tag_store::add_tag(&db, "/test/a.jpg", "   ");
        assert!(result.is_err());
    }

    #[test]
    fn search_by_single_tag_returns_matching_files() {
        let db = setup_db();
        tag_store::add_tag(&db, "/test/a.jpg", "beach").expect("add_tag");

        let results = tag_store::search_by_tags(&db, &["beach".to_string()]).expect("search");
        assert!(results.contains(&"/test/a.jpg".to_string()));
    }

    #[test]
    fn search_by_tags_with_empty_list_returns_empty() {
        let db = setup_db();
        let results = tag_store::search_by_tags(&db, &[]).expect("search");
        assert!(results.is_empty());
    }

    #[test]
    fn get_all_tags_returns_all_tags() {
        let db = setup_db();
        tag_store::add_tag(&db, "/test/a.jpg", "alpha").expect("add alpha");
        tag_store::add_tag(&db, "/test/a.jpg", "beta").expect("add beta");

        let all = tag_store::get_all_tags(&db).expect("get_all_tags");
        let names: Vec<&str> = all.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"alpha"));
        assert!(names.contains(&"beta"));
    }
}

#[cfg(test)]
mod db_tests {
    use crate::db::initialize;
    use rusqlite::Connection;

    #[test]
    fn initialize_creates_tables() {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        initialize(&conn).expect("initialize");

        // Check that tables exist
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('files','tags','file_tags')",
                [],
                |row| row.get(0),
            )
            .expect("query");
        assert_eq!(count, 3, "Expected 3 tables: files, tags, file_tags");
    }

    #[test]
    fn initialize_is_idempotent() {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        initialize(&conn).expect("first initialize");
        initialize(&conn).expect("second initialize should not fail");
    }
}
