import { useEffect } from "react";
import { useKeyboard } from "./hooks/useKeyboard";
import { useAppStore } from "./store";
import { commands } from "./lib/tauri";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import Viewer from "./components/Viewer";
import Player from "./components/Player";
import SearchBar from "./components/SearchBar";
import InfoPanel from "./components/InfoPanel";
import FilterPanel from "./components/FilterPanel";

export default function App() {
  useKeyboard();

  const {
    viewMode,
    isFullscreen,
    currentFolder,
    setCurrentFolder,
    setFiles,
    setIsScanning,
    isScanning,
    infoPanelOpen,
    searchQuery,
    fileTypeFilter,
    tagFilter,
    showFilterPanel,
  } = useAppStore();

  // Scan folder when it changes
  useEffect(() => {
    if (!currentFolder) return;
    const token = useAppStore.getState().scanToken;
    setIsScanning(true);
    commands
      .scanFolder(currentFolder)
      .then((files) => {
        if (useAppStore.getState().scanToken === token) setFiles(files);
      })
      .catch(console.error)
      .finally(() => {
        if (useAppStore.getState().scanToken === token) setIsScanning(false);
      });
  }, [currentFolder]);

  // Re-filter when search/filter changes (without rescanning)
  useEffect(() => {
    if (!currentFolder) return;
    commands
      .getFiles(currentFolder, {
        search: searchQuery || undefined,
        fileTypeFilter: fileTypeFilter === "all" ? undefined : fileTypeFilter,
        tagFilter: tagFilter.length > 0 ? tagFilter : undefined,
      })
      .then(setFiles)
      .catch(console.error);
  }, [searchQuery, fileTypeFilter, tagFilter]);

  const showViewer = viewMode === "viewer";
  const showPlayer = viewMode === "player";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a1a] text-[#e0e0e0]">
      {/* Left Sidebar — hidden in fullscreen */}
      {!isFullscreen && (
        <aside className="w-56 flex-shrink-0 border-r border-[#444] flex flex-col overflow-hidden">
          <Sidebar onFolderSelect={setCurrentFolder} />
        </aside>
      )}

      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar — hidden in fullscreen */}
        {!isFullscreen && (
          <div className="flex-shrink-0 border-b border-[#444]">
            <div className="px-3 py-2">
              <SearchBar />
            </div>
            {showFilterPanel && <FilterPanel />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {/* Scan overlay */}
          {isScanning && (
            <div className="absolute inset-0 z-50 bg-[#1a1a1a]/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-[#333] border-t-[#4a9eff] rounded-full animate-spin" />
              <p className="text-[#e0e0e0] text-base font-semibold">スキャン中…</p>
              <p className="text-[#757575] text-xs">ESC でキャンセル</p>
            </div>
          )}

          {!currentFolder && !showViewer && !showPlayer && <EmptyState />}

          {/* Gallery: always mounted to preserve scroll position */}
          <div style={{ display: currentFolder && !showViewer && !showPlayer ? "block" : "none", height: "100%" }}>
            <Gallery />
          </div>

          {showViewer && <Viewer />}
          {showPlayer && <Player />}
        </div>
      </div>

      {/* Right Info Panel */}
      {!isFullscreen && infoPanelOpen && (
        <aside className="w-64 flex-shrink-0 border-l border-[#444] overflow-y-auto">
          <InfoPanel />
        </aside>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-[#757575]">
      <svg
        className="w-16 h-16 opacity-40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
      <p className="text-sm">左のサイドバーからフォルダを選択してください</p>
    </div>
  );
}
