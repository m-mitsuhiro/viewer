import { create } from "zustand";
import { FileEntry, FileMetadata } from "../lib/tauri";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type ViewMode = "gallery" | "viewer" | "player";
export type FileTypeFilter = "all" | "image" | "video";
export type SortField = "name" | "date" | "size" | "type";

export interface Playlist {
  name: string;
  filePaths: string[];
  folder: string | null;
}

const applySort = (files: FileEntry[], field: SortField, dir: "asc" | "desc"): FileEntry[] => {
  return [...files].sort((a, b) => {
    let cmp = 0;
    if (field === "name") cmp = a.name.localeCompare(b.name, "ja");
    else if (field === "date") cmp = a.modifiedAt.localeCompare(b.modifiedAt);
    else if (field === "size") cmp = (a.size as number) - (b.size as number);
    else if (field === "type") cmp = a.fileType.localeCompare(b.fileType);
    return dir === "asc" ? cmp : -cmp;
  });
};

const PLAYLIST_KEY = "viewer-playlists";
const loadStoredPlaylists = (): Playlist[] => {
  try { return JSON.parse(localStorage.getItem(PLAYLIST_KEY) ?? "[]"); }
  catch { return []; }
};

const SORT_KEY = "viewer-sort";
const loadSortPrefs = (): { sortField: SortField; sortDirection: "asc" | "desc"; thumbSizePreference: number } => {
  try {
    const s = JSON.parse(localStorage.getItem(SORT_KEY) ?? "{}");
    return {
      sortField: (["name","date","size","type"] as SortField[]).includes(s.sortField) ? s.sortField : "name",
      sortDirection: s.sortDirection === "desc" ? "desc" : "asc",
      thumbSizePreference: Number(s.thumbSizePreference) || 160,
    };
  } catch {
    return { sortField: "name", sortDirection: "asc", thumbSizePreference: 160 };
  }
};
const saveSortPrefs = (field: SortField, dir: "asc" | "desc", thumbSize: number) =>
  localStorage.setItem(SORT_KEY, JSON.stringify({ sortField: field, sortDirection: dir, thumbSizePreference: thumbSize }));

const initialSortPrefs = loadSortPrefs();

interface AppState {
  // ── Folder ──────────────────────────────────────────────────────
  currentFolder: string | null;
  setCurrentFolder: (folder: string) => void;

  // ── Files ───────────────────────────────────────────────────────
  files: FileEntry[];
  setFiles: (files: FileEntry[]) => void;
  filteredFiles: FileEntry[];
  setFilteredFiles: (files: FileEntry[]) => void;

  selectedIndex: number;
  selectedFile: FileEntry | null;
  selectFile: (index: number) => void;
  slideDirection: "prev" | "next";
  selectNext: () => void;
  selectPrev: () => void;

  // ── Shift-select anchor ──────────────────────────────────────────
  anchorIndex: number;
  setAnchorIndex: (i: number) => void;
  shiftSelectRange: (toIndex: number) => void;

  // ── Sort ────────────────────────────────────────────────────────
  sortField: SortField;
  sortDirection: "asc" | "desc";
  setSortField: (f: SortField) => void;
  setSortDirection: (d: "asc" | "desc") => void;

  // ── Selection (for slideshow) ────────────────────────────────────
  checkedFileIds: Set<number>;
  toggleFileChecked: (id: number) => void;
  clearChecked: () => void;

  // ── View ────────────────────────────────────────────────────────
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  openFile: (index: number) => void;
  closeViewer: () => void;

  isFullscreen: boolean;
  setFullscreen: (v: boolean) => void;

  // ── Search / Filter ─────────────────────────────────────────────
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  fileTypeFilter: FileTypeFilter;
  setFileTypeFilter: (f: FileTypeFilter) => void;
  tagFilter: string[];
  setTagFilter: (tags: string[]) => void;
  extFilter: string[];
  setExtFilter: (exts: string[]) => void;

  // ── Info Panel ──────────────────────────────────────────────────
  infoPanelOpen: boolean;
  toggleInfoPanel: () => void;
  currentMetadata: FileMetadata | null;
  setCurrentMetadata: (m: FileMetadata | null) => void;

  // ── Slideshow ───────────────────────────────────────────────────
  slideshowActive: boolean;
  slideshowInterval: number; // seconds
  toggleSlideshow: () => void;
  startSlideshow: () => void;
  setSlideshowInterval: (s: number) => void;

  // ── Playlists ───────────────────────────────────────────────────
  playlists: Playlist[];
  savePlaylist: (name: string) => void;
  loadPlaylist: (name: string) => void;
  deletePlaylist: (name: string) => void;

  // ── Show only checked ────────────────────────────────────────────
  showOnlyChecked: boolean;
  toggleShowOnlyChecked: () => void;

  // ── Advanced filters (frontend-applied) ─────────────────────────
  showFilterPanel: boolean;
  toggleFilterPanel: () => void;
  dateFrom: string;
  dateTo: string;
  sizeMinKB: number;
  sizeMaxKB: number;
  nameFilter: string;
  setDateFrom: (s: string) => void;
  setDateTo: (s: string) => void;
  setSizeMinKB: (n: number) => void;
  setSizeMaxKB: (n: number) => void;
  setNameFilter: (s: string) => void;

  // ── Thumbnail size ───────────────────────────────────────────────
  thumbSizePreference: number;
  setThumbSizePreference: (s: number) => void;

  // ── Pending playlist (applied after folder change + rescan) ──────
  pendingPlaylistPaths: string[] | null;

  // ── Hide no-thumbnail ────────────────────────────────────────────
  hideNoThumbnail: boolean;
  toggleHideNoThumbnail: () => void;
  failedThumbnailPaths: Set<string>;
  addFailedThumbnailPath: (path: string) => void;

  // ── Loading ─────────────────────────────────────────────────────
  isScanning: boolean;
  setIsScanning: (v: boolean) => void;
  scanToken: number;
  cancelScan: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Folder ──────────────────────────────────────────────────────
  currentFolder: null,
  setCurrentFolder: (folder) => set({ currentFolder: folder }),

  // ── Files ───────────────────────────────────────────────────────
  files: [],
  filteredFiles: [],
  setFilteredFiles: (files) => set({ filteredFiles: files }),
  setFiles: (files) => {
    const { sortField, sortDirection, pendingPlaylistPaths } = get();
    const sorted = applySort(files, sortField, sortDirection);
    if (pendingPlaylistPaths !== null) {
      const pathSet = new Set(pendingPlaylistPaths);
      const ids = new Set(sorted.filter(f => pathSet.has(f.path)).map(f => f.id));
      set({ files: sorted, selectedIndex: -1, selectedFile: null, checkedFileIds: ids, pendingPlaylistPaths: null });
    } else {
      set({ files: sorted, selectedIndex: -1, selectedFile: null, checkedFileIds: new Set() });
    }
  },

  selectedIndex: -1,
  selectedFile: null,
  slideDirection: "next",
  selectFile: (index) => {
    const file = get().files[index] ?? null;
    set({ selectedIndex: index, selectedFile: file, anchorIndex: index });
  },
  selectNext: () => {
    const { selectedIndex, files, filteredFiles, viewMode, slideshowActive, checkedFileIds } = get();
    const navList = filteredFiles.length > 0 ? filteredFiles : files;
    let nextFile: FileEntry | null;
    if (slideshowActive && checkedFileIds.size > 0) {
      const checked = navList.filter((f) => checkedFileIds.has(f.id));
      const pos = checked.findIndex((f) => f === files[selectedIndex]);
      nextFile = checked[(pos + 1) % checked.length] ?? null;
    } else {
      const pos = navList.findIndex((f) => f === files[selectedIndex]);
      nextFile = navList[Math.min(pos + 1, navList.length - 1)] ?? null;
    }
    if (!nextFile) return;
    const next = files.indexOf(nextFile);
    set({ selectedIndex: next, selectedFile: nextFile, slideDirection: "next" });
    if (viewMode !== "gallery") {
      set({ viewMode: nextFile.fileType === "video" ? "player" : "viewer" });
    }
  },
  selectPrev: () => {
    const { selectedIndex, files, filteredFiles, viewMode, slideshowActive, checkedFileIds } = get();
    const navList = filteredFiles.length > 0 ? filteredFiles : files;
    let prevFile: FileEntry | null;
    if (slideshowActive && checkedFileIds.size > 0) {
      const checked = navList.filter((f) => checkedFileIds.has(f.id));
      const pos = checked.findIndex((f) => f === files[selectedIndex]);
      prevFile = checked[(pos - 1 + checked.length) % checked.length] ?? null;
    } else {
      const pos = navList.findIndex((f) => f === files[selectedIndex]);
      prevFile = navList[Math.max(pos - 1, 0)] ?? null;
    }
    if (!prevFile) return;
    const prev = files.indexOf(prevFile);
    set({ selectedIndex: prev, selectedFile: prevFile, slideDirection: "prev" });
    if (viewMode !== "gallery") {
      set({ viewMode: prevFile.fileType === "video" ? "player" : "viewer" });
    }
  },

  // ── Shift-select anchor ──────────────────────────────────────────
  anchorIndex: -1,
  setAnchorIndex: (i) => set({ anchorIndex: i }),
  shiftSelectRange: (toIndex) => {
    const { anchorIndex, files } = get();
    if (anchorIndex < 0) return;
    const start = Math.min(anchorIndex, toIndex);
    const end = Math.max(anchorIndex, toIndex);
    const ids = new Set(files.slice(start, end + 1).map(f => f.id));
    set({ checkedFileIds: ids, selectedIndex: toIndex, selectedFile: files[toIndex] ?? null });
  },

  // ── Sort ────────────────────────────────────────────────────────
  sortField: initialSortPrefs.sortField,
  sortDirection: initialSortPrefs.sortDirection,
  setSortField: (f) => {
    const { files, sortDirection, thumbSizePreference } = get();
    saveSortPrefs(f, sortDirection, thumbSizePreference);
    set({ sortField: f, files: applySort(files, f, sortDirection) });
  },
  setSortDirection: (d) => {
    const { files, sortField, thumbSizePreference } = get();
    saveSortPrefs(sortField, d, thumbSizePreference);
    set({ sortDirection: d, files: applySort(files, sortField, d) });
  },

  // ── Selection ───────────────────────────────────────────────────
  checkedFileIds: new Set(),
  toggleFileChecked: (id) => {
    const next = new Set(get().checkedFileIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    set({ checkedFileIds: next });
  },
  clearChecked: () => set({ checkedFileIds: new Set() }),

  // ── View ────────────────────────────────────────────────────────
  viewMode: "gallery",
  setViewMode: (mode) => set({ viewMode: mode }),
  openFile: (index) => {
    const file = get().files[index];
    if (!file) return;
    set({ selectedIndex: index, selectedFile: file, viewMode: file.fileType === "video" ? "player" : "viewer" });
  },
  closeViewer: () => {
    getCurrentWebviewWindow().setFullscreen(false).catch(console.error);
    set({ viewMode: "gallery", isFullscreen: false, slideshowActive: false });
  },

  isFullscreen: false,
  setFullscreen: (v) => {
    getCurrentWebviewWindow().setFullscreen(v).catch(console.error);
    set({ isFullscreen: v });
  },

  // ── Search / Filter ─────────────────────────────────────────────
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  fileTypeFilter: "all",
  setFileTypeFilter: (f) => set({ fileTypeFilter: f }),
  tagFilter: [],
  setTagFilter: (tags) => set({ tagFilter: tags }),
  extFilter: [],
  setExtFilter: (exts) => set({ extFilter: exts }),

  // ── Info Panel ──────────────────────────────────────────────────
  infoPanelOpen: false,
  toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
  currentMetadata: null,
  setCurrentMetadata: (m) => set({ currentMetadata: m }),

  // ── Slideshow ───────────────────────────────────────────────────
  slideshowActive: false,
  slideshowInterval: 3,
  toggleSlideshow: () => set((s) => ({ slideshowActive: !s.slideshowActive })),
  startSlideshow: () => {
    const { files, checkedFileIds } = get();
    if (files.length === 0) return;
    let startIndex = 0;
    if (checkedFileIds.size > 0) {
      const first = files.findIndex((f) => checkedFileIds.has(f.id));
      if (first >= 0) startIndex = first;
    }
    const file = files[startIndex];
    if (!file) return;
    set({ slideshowActive: true, selectedIndex: startIndex, selectedFile: file, viewMode: file.fileType === "video" ? "player" : "viewer" });
  },
  setSlideshowInterval: (s) => set({ slideshowInterval: s }),

  // ── Playlists ───────────────────────────────────────────────────
  playlists: loadStoredPlaylists(),
  savePlaylist: (name) => {
    const { checkedFileIds, files, playlists, currentFolder } = get();
    const filePaths = files.filter(f => checkedFileIds.has(f.id)).map(f => f.path);
    const updated = [...playlists.filter(p => p.name !== name), { name, filePaths, folder: currentFolder }];
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
    set({ playlists: updated });
  },
  loadPlaylist: (name) => {
    const { playlists, files, currentFolder } = get();
    const pl = playlists.find(p => p.name === name);
    if (!pl) return;
    if (pl.folder && pl.folder !== currentFolder) {
      // フォルダーが異なる → フォルダー変更してrescan後に選択を復元
      set({ pendingPlaylistPaths: pl.filePaths, currentFolder: pl.folder });
    } else {
      // 同じフォルダー → 即座に選択を適用
      const pathSet = new Set(pl.filePaths);
      const ids = new Set(files.filter(f => pathSet.has(f.path)).map(f => f.id));
      set({ checkedFileIds: ids });
    }
  },
  deletePlaylist: (name) => {
    const updated = get().playlists.filter(p => p.name !== name);
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
    set({ playlists: updated });
  },

  // ── Show only checked ────────────────────────────────────────────
  showOnlyChecked: false,
  toggleShowOnlyChecked: () => set((s) => ({ showOnlyChecked: !s.showOnlyChecked })),

  // ── Advanced filters ─────────────────────────────────────────────
  showFilterPanel: false,
  toggleFilterPanel: () => set((s) => ({ showFilterPanel: !s.showFilterPanel })),
  dateFrom: "",
  dateTo: "",
  sizeMinKB: 0,
  sizeMaxKB: 0,
  nameFilter: "",
  setDateFrom: (s) => set({ dateFrom: s }),
  setDateTo: (s) => set({ dateTo: s }),
  setSizeMinKB: (n) => set({ sizeMinKB: n }),
  setSizeMaxKB: (n) => set({ sizeMaxKB: n }),
  setNameFilter: (s) => set({ nameFilter: s }),

  // ── Thumbnail size ───────────────────────────────────────────────
  thumbSizePreference: initialSortPrefs.thumbSizePreference,
  setThumbSizePreference: (s) => {
    const { sortField, sortDirection } = get();
    saveSortPrefs(sortField, sortDirection, s);
    set({ thumbSizePreference: s });
  },
  pendingPlaylistPaths: null,

  // ── Hide no-thumbnail ────────────────────────────────────────────
  hideNoThumbnail: false,
  toggleHideNoThumbnail: () => set((s) => ({ hideNoThumbnail: !s.hideNoThumbnail })),
  failedThumbnailPaths: new Set(),
  addFailedThumbnailPath: (path) => {
    const next = new Set(get().failedThumbnailPaths);
    next.add(path);
    set({ failedThumbnailPaths: next });
  },

  // ── Loading ─────────────────────────────────────────────────────
  isScanning: false,
  setIsScanning: (v) => set({ isScanning: v }),
  scanToken: 0,
  cancelScan: () => set((s) => ({ scanToken: s.scanToken + 1, isScanning: false })),
}));
