import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore, FileTypeFilter, SortField } from "../../store";

const SORT_LABELS: Record<SortField, string> = {
  name: "名前",
  date: "日付",
  size: "サイズ",
  type: "種別",
};

export default function SearchBar() {
  const {
    searchQuery, setSearchQuery,
    fileTypeFilter, setFileTypeFilter,
    sortField, sortDirection, setSortField, setSortDirection,
    toggleInfoPanel, infoPanelOpen,
    slideshowActive, slideshowInterval, setSlideshowInterval,
    startSlideshow, toggleSlideshow,
    checkedFileIds,
    files,
    hideNoThumbnail, toggleHideNoThumbnail,
    playlists, savePlaylist, loadPlaylist, deletePlaylist,
    thumbSizePreference, setThumbSizePreference,
    showFilterPanel, toggleFilterPanel,
    dateFrom, dateTo, sizeMinKB, sizeMaxKB, tagFilter,
    showOnlyChecked, toggleShowOnlyChecked,
  } = useAppStore();

  const filterActiveCount = [dateFrom, dateTo, sizeMinKB > 0, sizeMaxKB > 0, tagFilter.length > 0].filter(Boolean).length;

  const inputRef = useRef<HTMLInputElement>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const playlistRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!playlistOpen) return;
    const handler = (e: MouseEvent) => {
      if (playlistRef.current && !playlistRef.current.contains(e.target as Node)) {
        setPlaylistOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playlistOpen]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    inputRef.current?.focus();
  }, [setSearchQuery]);

  const handleSlideshowClick = () => {
    if (slideshowActive) {
      toggleSlideshow();
    } else {
      startSlideshow();
    }
  };

  const checkedCount = checkedFileIds.size;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search input */}
      <div className="relative flex-1 max-w-xs">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="ファイル名で検索… (Ctrl+F)"
          value={searchQuery}
          onChange={handleSearch}
          className="w-full bg-[#2d2d2d] border border-[#444] rounded px-8 py-1 text-sm text-[#e0e0e0] placeholder-[#757575] focus:outline-none focus:border-[#4a9eff]"
        />
        {searchQuery && (
          <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#757575] hover:text-[#e0e0e0]">✕</button>
        )}
      </div>

      {/* File type filter */}
      <div className="flex rounded border border-[#444] overflow-hidden text-xs">
        {(["all", "image", "video"] as FileTypeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFileTypeFilter(f)}
            className={`px-2 py-1 transition-colors ${fileTypeFilter === f ? "bg-[#4a9eff] text-white" : "bg-[#2d2d2d] text-[#9e9e9e] hover:bg-[#383838]"}`}
          >
            {f === "all" ? "全て" : f === "image" ? "画像" : "動画"}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1">
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className="bg-[#2d2d2d] border border-[#444] rounded px-2 py-1 text-xs text-[#e0e0e0] focus:outline-none focus:border-[#4a9eff]"
        >
          {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
            <option key={f} value={f}>{SORT_LABELS[f]}</option>
          ))}
        </select>
        <button
          onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
          className="px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded text-xs text-[#9e9e9e] hover:bg-[#383838] transition-colors"
          title={sortDirection === "asc" ? "昇順" : "降順"}
        >
          {sortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Thumbnail size slider */}
      <div className="flex items-center gap-1" title={`サムネイルサイズ: ${thumbSizePreference}px`}>
        <span className="text-xs text-[#757575]">🖼</span>
        <input
          type="range"
          min={60}
          max={300}
          step={10}
          value={thumbSizePreference}
          onChange={(e) => setThumbSizePreference(Number(e.target.value))}
          className="w-20 accent-[#4a9eff] cursor-pointer"
        />
        <span className="text-xs text-[#757575] w-8 text-right">{thumbSizePreference}</span>
      </div>

      {/* Slideshow controls */}
      {files.length > 0 && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleSlideshowClick}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
              slideshowActive
                ? "bg-[#4a9eff] border-[#4a9eff] text-white"
                : "bg-[#2d2d2d] border-[#444] text-[#9e9e9e] hover:bg-[#383838]"
            }`}
            title="スライドショー (Space)"
          >
            {slideshowActive ? "⏹" : "▶"}
            {checkedCount > 0 && !slideshowActive ? ` ${checkedCount}枚` : " スライドショー"}
          </button>
          <input
            type="number"
            min={1}
            max={60}
            value={slideshowInterval}
            onChange={(e) => setSlideshowInterval(Math.max(1, Number(e.target.value)))}
            className="w-12 bg-[#2d2d2d] border border-[#444] rounded px-1 py-1 text-xs text-[#e0e0e0] text-center focus:outline-none focus:border-[#4a9eff]"
            title="切り替え間隔（秒）"
          />
          <span className="text-xs text-[#757575]">秒</span>
          {checkedCount > 0 && (
            <>
              <button
                onClick={toggleShowOnlyChecked}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  showOnlyChecked ? "bg-[#4a9eff] border-[#4a9eff] text-white" : "bg-[#2d2d2d] border-[#444] text-[#9e9e9e] hover:bg-[#383838]"
                }`}
                title="選択ファイルのみ表示"
              >
                選択のみ
              </button>
              <button
                onClick={() => { useAppStore.getState().clearChecked(); if (showOnlyChecked) toggleShowOnlyChecked(); }}
                className="text-xs text-[#757575] hover:text-[#e0e0e0] px-1"
                title="選択解除"
              >
                選択解除
              </button>
            </>
          )}
        </div>
      )}

      {/* Hide no-thumbnail toggle */}
      <button
        onClick={toggleHideNoThumbnail}
        className={`px-2 py-1 rounded text-xs border transition-colors ${
          hideNoThumbnail ? "bg-[#4a9eff] border-[#4a9eff] text-white" : "bg-[#2d2d2d] border-[#444] text-[#9e9e9e] hover:bg-[#383838]"
        }`}
        title="サムネイル表示不可ファイルを非表示"
      >
        非表示
      </button>

      {/* Playlist */}
      <div className="flex items-center gap-1">
        {/* Save playlist button */}
        {checkedCount > 0 && (
          <button
            onClick={() => {
              const name = prompt("プレイリスト名を入力:");
              if (name?.trim()) savePlaylist(name.trim());
            }}
            className="px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded text-xs text-[#9e9e9e] hover:bg-[#383838]"
            title="選択をプレイリストとして保存"
          >
            💾 保存
          </button>
        )}
        {/* Playlist dropdown with inline delete */}
        {playlists.length > 0 && (
          <div ref={playlistRef} className="relative">
            <button
              onClick={() => setPlaylistOpen((v) => !v)}
              className={`px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded text-xs text-[#9e9e9e] hover:bg-[#383838] flex items-center gap-1 ${playlistOpen ? "border-[#4a9eff]" : ""}`}
            >
              📂 プレイリスト ({playlists.length})
            </button>
            {playlistOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-[#2d2d2d] border border-[#444] rounded shadow-lg min-w-48 py-1">
                {checkedCount > 0 && (
                  <>
                    <button
                      className="w-full text-left px-2 py-1 text-xs text-[#757575] hover:bg-[#383838] hover:text-[#e0e0e0]"
                      onClick={() => { useAppStore.getState().clearChecked(); setPlaylistOpen(false); }}
                    >
                      ✕ 選択解除
                    </button>
                    <div className="border-t border-[#444] my-1" />
                  </>
                )}
                {playlists.map((p) => (
                  <div key={p.name} className="flex items-center gap-1 px-2 py-1 hover:bg-[#383838] group">
                    <button
                      className="flex-1 text-left text-xs text-[#e0e0e0] truncate"
                      onClick={() => { loadPlaylist(p.name); setPlaylistOpen(false); }}
                      title={`${p.name}　(${p.filePaths.length}件) — クリックで読み込み`}
                    >
                      {p.name}
                      <span className="text-[#757575] ml-1">({p.filePaths.length}件)</span>
                    </button>
                    <button
                      onClick={() => deletePlaylist(p.name)}
                      className="opacity-0 group-hover:opacity-100 text-[#757575] hover:text-red-400 transition-opacity px-1 flex-shrink-0"
                      title="削除"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter panel toggle */}
      <button
        onClick={toggleFilterPanel}
        className={`px-2 py-1 rounded text-xs border transition-colors flex items-center gap-1 ${
          showFilterPanel ? "bg-[#4a9eff] border-[#4a9eff] text-white" : "bg-[#2d2d2d] border-[#444] text-[#9e9e9e] hover:bg-[#383838]"
        }`}
        title="詳細フィルター"
      >
        ▼ フィルター{filterActiveCount > 0 && <span className="bg-white/20 rounded-full px-1">{filterActiveCount}</span>}
      </button>

      {/* Info panel toggle */}
      <button
        onClick={toggleInfoPanel}
        className={`ml-auto p-1 rounded transition-colors ${infoPanelOpen ? "text-[#4a9eff]" : "text-[#757575] hover:text-[#e0e0e0]"}`}
        title="情報パネル (I)"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
  );
}
