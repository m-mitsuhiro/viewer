import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../store";
import { FileEntry, commands, formatBytes } from "../../lib/tauri";

const GAP = 8;
const MIN_COLUMNS = 2;

function useThumbnail(path: string, enabled: boolean, onFail?: () => void) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !path) return;
    let cancelled = false;
    setLoading(true);
    commands
      .getThumbnail(path)
      .then((b64) => { if (!cancelled) setSrc(`data:image/jpeg;base64,${b64}`); })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          onFail?.();
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, enabled]);

  return { src, loading };
}

function ThumbnailItem({
  file,
  fileIndex,
  isVisible,
  thumbSize,
}: {
  file: FileEntry;
  fileIndex: number;
  isVisible: boolean;
  thumbSize: number;
}) {
  const { selectedIndex, openFile, selectFile, checkedFileIds, toggleFileChecked, shiftSelectRange, addFailedThumbnailPath } = useAppStore();
  const { src, loading } = useThumbnail(
    file.path,
    isVisible && !!file.path,
    () => addFailedThumbnailPath(file.path)
  );
  const isSelected = selectedIndex === fileIndex;
  const isChecked = checkedFileIds.has(file.id);
  const isVideo = file.fileType === "video";

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      shiftSelectRange(fileIndex);
    } else if (e.ctrlKey || e.metaKey) {
      toggleFileChecked(file.id);
    } else {
      selectFile(fileIndex);
    }
  };

  return (
    <div
      className={`relative flex flex-col cursor-pointer rounded overflow-hidden border transition-all
        ${isChecked ? "border-[#4a9eff] ring-2 ring-[#4a9eff]/60" : isSelected ? "border-[#4a9eff] ring-2 ring-[#4a9eff]/30" : "border-[#444] hover:border-[#666]"}`}
      style={{ width: thumbSize, height: thumbSize + 36 }}
      onClick={handleClick}
      onDoubleClick={() => openFile(fileIndex)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") openFile(fileIndex); }}
    >
      {/* Thumbnail area */}
      <div className="w-full flex items-center justify-center bg-[#2d2d2d]" style={{ height: thumbSize }}>
        {loading && <div className="w-6 h-6 border-2 border-[#555] border-t-[#4a9eff] rounded-full animate-spin" />}
        {!loading && src && <img src={src} alt={file.name} className="w-full h-full object-contain" draggable={false} />}
        {!loading && !src && <span className="text-2xl">{isVideo ? "🎬" : "🖼"}</span>}
        {isVideo && <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">▶</span>}

        {/* Checked badge */}
        {isChecked && (
          <div className="absolute top-1 right-1">
            <div className="w-5 h-5 rounded-full bg-[#4a9eff] flex items-center justify-center text-white text-xs font-bold shadow">✓</div>
          </div>
        )}
      </div>

      {/* File name */}
      <div className="px-1 py-1 bg-[#1a1a1a]">
        <p className="text-xs text-[#e0e0e0] truncate" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-[#757575]">{formatBytes(file.size)}</p>
      </div>
    </div>
  );
}

export default function Gallery() {
  const { files, currentFolder, checkedFileIds, hideNoThumbnail, failedThumbnailPaths, thumbSizePreference,
          dateFrom, dateTo, sizeMinKB, sizeMaxKB, showOnlyChecked, nameFilter, extFilter,
          setFilteredFiles } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const displayedFiles = useMemo(() => {
    let result = hideNoThumbnail ? files.filter(f => !failedThumbnailPaths.has(f.path)) : files;
    if (showOnlyChecked && checkedFileIds.size > 0) result = result.filter(f => checkedFileIds.has(f.id));
    if (nameFilter) result = result.filter(f => f.name.toLowerCase().includes(nameFilter.toLowerCase()));
    if (extFilter.length > 0) result = result.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const normalized = ext === 'jpeg' ? 'jpg' : ext;
      return extFilter.includes(normalized);
    });
    if (dateFrom) result = result.filter(f => f.modifiedAt >= dateFrom);
    if (dateTo)   result = result.filter(f => f.modifiedAt <= dateTo + "T23:59:59");
    if (sizeMinKB > 0) result = result.filter(f => f.size >= sizeMinKB * 1024);
    if (sizeMaxKB > 0) result = result.filter(f => f.size <= sizeMaxKB * 1024);
    return result;
  }, [files, hideNoThumbnail, failedThumbnailPaths, showOnlyChecked, checkedFileIds, nameFilter, extFilter, dateFrom, dateTo, sizeMinKB, sizeMaxKB]);

  // Keep store's filteredFiles in sync so Viewer navigates within the filtered list
  useEffect(() => {
    setFilteredFiles(displayedFiles);
  }, [displayedFiles]);

  const columns = Math.max(MIN_COLUMNS, Math.floor((containerWidth - GAP) / (thumbSizePreference + GAP)));
  const thumbSize = Math.floor((containerWidth - GAP * (columns + 1)) / columns);
  const rowCount = Math.ceil(displayedFiles.length / columns);
  const rowHeight = thumbSize + 36 + GAP;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });

  if (files.length === 0 && currentFolder) {
    return <div className="flex items-center justify-center h-full text-[#757575] text-sm">このフォルダには対応ファイルがありません</div>;
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden" style={{ paddingLeft: GAP, paddingTop: GAP }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          return (
            <div
              key={virtualRow.key}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)`, display: "flex", gap: GAP, paddingRight: GAP, paddingBottom: GAP }}
            >
              {Array.from({ length: columns }, (_, col) => {
                const displayIdx = startIdx + col;
                if (displayIdx >= displayedFiles.length) return null;
                const file = displayedFiles[displayIdx];
                // Find the index in the original files array for store operations
                const fileIndex = files.indexOf(file);
                return (
                  <ThumbnailItem
                    key={file.path}
                    file={file}
                    fileIndex={fileIndex}
                    isVisible={true}
                    thumbSize={thumbSize}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-[#1a1a1a]/90 text-xs text-[#757575] px-3 py-1 border-t border-[#333] flex items-center gap-2">
        <span>{displayedFiles.length}{hideNoThumbnail && displayedFiles.length !== files.length ? ` / ${files.length}` : ""} 件</span>
        <button
          onClick={() => {
            const ids = new Set(displayedFiles.map(f => f.id));
            useAppStore.setState({ checkedFileIds: ids });
          }}
          className="px-1.5 py-0.5 rounded border border-[#444] bg-[#2d2d2d] hover:bg-[#383838] text-[#9e9e9e]"
        >
          全選択
        </button>
        <button
          onClick={() => useAppStore.setState({ checkedFileIds: new Set() })}
          className="px-1.5 py-0.5 rounded border border-[#444] bg-[#2d2d2d] hover:bg-[#383838] text-[#9e9e9e]"
        >
          全解除
        </button>
        {checkedFileIds.size > 0 && (
          <span className="text-[#4a9eff]">
            {checkedFileIds.size} 件選択中 — Shift+クリック/矢印で範囲選択、Ctrl+クリックで個別選択
          </span>
        )}
        {checkedFileIds.size === 0 && (
          <span className="opacity-50">— Ctrl+クリックで選択、Shift+クリックで範囲選択</span>
        )}
      </div>
    </div>
  );
}
