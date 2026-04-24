# viewer — 実行計画 TODO

仕様書: [CLAUDE.md](./CLAUDE.md)

凡例: `[ ]` 未着手 / `[x]` 完了

---

## Phase 1: 環境構築・プロジェクト初期化

- [x] **1-1** 開発ツールのインストール確認
  - [x] Rust (`rustup`) のインストール・バージョン確認 → rustc 1.94.0
  - [x] Node.js v20 の有効化 (`nvm use 20`) → v20.17.0
  - [ ] Tauri CLI のインストール (`cargo install tauri-cli`) ※ビルド時に実施
  - [ ] Windows向けビルドツール確認（WSL2からのクロスコンパイル or Windows上でビルド）
- [x] **1-2** Tauriプロジェクトの初期化
  - [x] プロジェクト雛形を手動作成（ディレクトリが空でなかったため）
  - [x] React + TypeScript テンプレートの設定
  - [x] Tailwind CSS のセットアップ
- [x] **1-3** フロントエンド依存パッケージのインストール
  - [x] `zustand`（状態管理）
  - [x] `@tanstack/react-virtual`（仮想スクロール）
  - [x] Vitest（テストフレームワーク）
- [x] **1-4** Rustバックエンド依存クレートの追加 (`Cargo.toml`)
  - [x] `image`（画像処理）
  - [x] `kamadak-exif`（EXIFメタデータ）
  - [x] `rusqlite` bundled（SQLite）
  - [x] `tokio`（非同期ランタイム）
  - [x] `serde` / `serde_json`（シリアライズ）
  - [x] `trash`（ゴミ箱操作）
  - [x] `walkdir`（ファイルツリー走査）
- [x] **1-5** 開発用スクリプト・ビルド設定
  - [x] `tauri.conf.json` の基本設定（アプリ名・ウィンドウサイズ）
  - [x] `.prettierrc` の設定

---

## Phase 2: バックエンド（Rust）— データ層

- [x] **2-1** SQLiteスキーマ設計・マイグレーション実装 (`db.rs`)
  - [x] `files` テーブル（パス・タイプ・サイズ・更新日時）
  - [x] `tags` テーブル（タグ名）
  - [x] `file_tags` テーブル（ファイルとタグの中間テーブル）
- [x] **2-2** ファイルスキャナ (`file_scanner.rs`)
  - [x] 指定フォルダ以下の画像・動画ファイルを再帰スキャン（depth=1）
  - [x] 対応拡張子フィルタリング（jpg/jpeg/png/webp/bmp/tiff/mp4/mkv/avi/mov等）
  - [x] ファイル一覧をDBに登録・更新（INSERT OR UPDATE）
- [x] **2-3** サムネイル生成・キャッシュ (`thumbnail.rs`)
  - [x] 画像ファイルのサムネイル生成（最大 256x256px、Lanczos3）
  - [x] キャッシュディレクトリへの保存（`app_cache_dir/thumbnails/`）
  - [x] キャッシュヒット確認（ファイル更新日時で無効化）
  - [x] `tokio::task::spawn_blocking` でバックグラウンド生成
  - [ ] 動画サムネイル生成（ffmpeg連携）※将来対応
- [x] **2-4** メタデータ抽出 (`metadata.rs`)
  - [x] EXIFデータの読み取り（撮影日時・カメラ機種・解像度・GPS等）
  - [x] ファイルシステム情報の取得（サイズ・更新日時・作成日時）
- [x] **2-5** タグ管理 (`tag_store.rs`)
  - [x] タグの追加・削除・一覧取得
  - [x] ファイルへのタグ付与・解除
  - [x] タグでのファイル検索（AND検索）

---

## Phase 3: バックエンド（Rust）— Tauriコマンド層

- [x] **3-1** ファイル操作コマンド (`commands/files.rs`)
  - [x] `scan_folder(path)` — フォルダをスキャンしてファイル一覧を返す
  - [x] `get_files(folder, search, file_type_filter, tag_filter)` — 検索・フィルタ対応
  - [x] `get_thumbnail(path)` — base64エンコードJPEGを返す
  - [x] `get_metadata(path)` — メタデータを返す
  - [x] `delete_to_trash(path)` — ゴミ箱へ移動
  - [x] `open_in_explorer(path)` — エクスプローラーで開く
- [x] **3-2** タグコマンド (`commands/tags.rs`)
  - [x] `get_all_tags()` / `get_file_tags(path)`
  - [x] `add_tag(path, tag)` / `remove_tag(path, tag)`
  - [x] `search_by_tags(tags)` — タグでファイルパス検索
- [x] **3-3** フォルダツリーコマンド (`commands/folders.rs`)
  - [x] `get_drives()` — ドライブ一覧取得（Windows）
  - [x] `get_children(path)` — 子フォルダ一覧取得
- [ ] **3-4** ファイル監視イベント（`notify` クレート）※将来対応

---

## Phase 4: フロントエンド — 基盤

- [x] **4-1** グローバル状態設計（Zustand）`src/store/index.ts`
  - [x] 現在のフォルダパス / ファイル一覧 / 選択ファイル
  - [x] 表示モード（gallery / viewer / player）
  - [x] 検索・フィルタ条件 / スライドショー設定
- [x] **4-2** Tauriコマンドの型定義 (`src/lib/tauri.ts`)
  - [x] 各コマンドのTypeScript型定義（FileEntry, FolderEntry, FileMetadata）
  - [x] `invoke` ラッパー関数 / `convertFileSrc` / formatters
- [x] **4-3** レイアウト実装 (`src/App.tsx`)
  - [x] 左サイドバー / 中央メインエリア / 右パネル（開閉可能）
  - [x] ダークテーマ（`#1a1a1a` 背景）
- [x] **4-4** グローバルキーボードイベントハンドラ (`src/hooks/useKeyboard.ts`)
  - [x] 全ショートカットを一元管理（常に最新状態を参照）

---

## Phase 5: フロントエンド — 各コンポーネント

- [x] **5-1** サイドバー: フォルダツリー (`components/Sidebar/`)
  - [x] ドライブ一覧の表示（C:\ D:\など）
  - [x] フォルダの展開・折りたたみ（遅延ロード）
  - [x] フォルダクリックで中央エリアを更新
- [x] **5-2** ギャラリー: サムネイル一覧 (`components/Gallery/`)
  - [x] TanStack Virtual によるグリッド仮想スクロール
  - [x] サムネイル画像の表示（ローディングスピナーあり）
  - [x] ファイル名・サイズ・動画バッジの表示
  - [x] クリック(選択) / ダブルクリック(開く)
- [x] **5-3** 画像ビューア (`components/Viewer/`)
  - [x] フィット表示・マウスホイールズーム・ドラッグパン
  - [x] 回転（R/Shift+R）・左右反転（H）・上下反転（V）
  - [x] 前後ナビゲーション / フルスクリーン（F） / ズームリセット（0）
  - [x] スライドショー自動進行
- [x] **5-4** 動画プレーヤー (`components/Player/`)
  - [x] HTML5 `<video>` カスタムコントロールバー
  - [x] 再生速度（0.25x〜2x）/ ループ / 音量
  - [x] フルスクリーン / コントロール自動非表示
- [ ] **5-9** ネイティブ D&D（ギャラリー → 他アプリ）
  - [ ] `src-tauri/Cargo.toml`: `tauri-plugin-drag = "2"` 追加
  - [ ] `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_drag::init())` 登録
  - [ ] `src-tauri/capabilities/default.json`: `"drag:default"` 追加
  - [ ] `package.json`: `@tauri-apps/plugin-drag` 追加・`npm install`
  - [ ] `Gallery/index.tsx`: `ThumbnailItem` に `draggable` + `onDragStart` → `startDrag()` 追加
  - [ ] テスト: `startDrag` が正しいパス配列で呼ばれることを確認（単ファイル / チェック済み複数ファイル）
- [ ] **5-8** フレームキャプチャ (`components/Player/`, `commands/files.rs`)
  - [ ] Rust: `save_frame(video_path, jpeg_b64)` コマンド追加 → 動画と同フォルダに `{名前}_{日時}.jpg` 保存
  - [ ] `src/lib/tauri.ts`: `saveFrame` バインディング追加
  - [ ] Player: `,` / `.` キーでコマ送り（一時停止中のみ）
  - [ ] Player: `S` キー / 📷 ボタンでフレームキャプチャ
  - [ ] Player: 保存完了フィードバック（ファイル名を 2 秒表示）
- [x] **5-5** 検索・フィルタ (`components/SearchBar/`)
  - [x] ファイル名リアルタイム検索 / 種別フィルタ（全て/画像/動画）
  - [x] 情報パネル開閉ボタン
- [x] **5-6** メタデータ・タグパネル (`components/InfoPanel/`)
  - [x] EXIF / ファイル情報の一覧表示
  - [x] タグの表示・追加・削除UI

---

## Phase 6: テスト

- [x] **6-1** Rustユニットテスト (`src-tauri/src/tests.rs`)
  - [x] `db`: テーブル作成・冪等性
  - [x] `file_scanner`: 拡張子分類・大文字小文字非依存
  - [x] `tag_store`: CRUD・重複・空文字エラー・AND検索
- [x] **6-2** フロントエンドユニットテスト（Vitest）— 16テスト全パス
  - [x] `useAppStore`: ファイル選択・ナビゲーション・ビューモード・スライドショー
  - [x] `useKeyboard`: ArrowKey/F/Esc ショートカット動作・入力中は無視
- [ ] **6-3** 統合テスト ※実機での動作確認で代替

---

## Phase 7: パフォーマンスチューニング・仕上げ

- [ ] **7-1** 大量ファイルの動作確認（1,000枚・5,000枚・10,000枚）
- [ ] **7-2** サムネイル生成の並列数チューニング
- [ ] **7-3** メモリ使用量の計測・最適化
- [ ] **7-4** 起動時間の計測・最適化
- [ ] **7-5** アプリアイコンの設定
- [ ] **7-6** Windowsインストーラーのビルド (`cargo tauri build`)
- [ ] **7-7** 動作確認（Windows 10 / 11 実機）

---

## 実装順序の目安

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5-1〜5-3 → Phase 6-1
→ Phase 5-4〜5-7 → Phase 6-2〜6-3 → Phase 7
```

各Phaseは前のPhaseが完了してから着手する。
Phase 5内のコンポーネントは並行実装可能。
