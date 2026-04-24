import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  id: number;
  path: string;
  name: string;
  fileType: "image" | "video";
  size: number;
  modifiedAt: string;
  tags: string[];
}

export interface FolderEntry {
  path: string;
  name: string;
  hasChildren: boolean;
}

export interface FileMetadata {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  createdAt: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  gpsLat?: number;
  gpsLon?: number;
}

export interface Tag {
  id: number;
  name: string;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export const commands = {
  // Folder tree
  getDrives: () => invoke<FolderEntry[]>("get_drives"),
  getChildren: (path: string) => invoke<FolderEntry[]>("get_children", { path }),

  // Files
  scanFolder: (path: string) => invoke<FileEntry[]>("scan_folder", { path }),
  getFiles: (
    folder: string,
    opts?: {
      search?: string;
      fileTypeFilter?: string;
      tagFilter?: string[];
    }
  ) =>
    invoke<FileEntry[]>("get_files", {
      folder,
      search: opts?.search ?? null,
      fileTypeFilter: opts?.fileTypeFilter ?? null,
      tagFilter: opts?.tagFilter ?? null,
    }),

  getThumbnail: (path: string) => invoke<string>("get_thumbnail", { path }),
  getCachedThumbnail: (path: string) => invoke<string>("get_cached_thumbnail", { path }),
  saveThumbnailCache: (path: string, b64: string) => invoke<void>("save_thumbnail_cache", { path, b64 }),
  getMetadata: (path: string) => invoke<FileMetadata>("get_metadata", { path }),
  deleteToTrash: (path: string) => invoke<void>("delete_to_trash", { path }),
  openInExplorer: (path: string) => invoke<void>("open_in_explorer", { path }),
  saveFrame: (videoPath: string, jpegB64: string) =>
    invoke<string>("save_frame", { videoPath, jpegB64 }),

  // Tags
  getAllTags: () => invoke<Tag[]>("get_all_tags"),
  getFileTags: (path: string) => invoke<string[]>("get_file_tags", { path }),
  addTag: (path: string, tag: string) => invoke<void>("add_tag", { path, tag }),
  removeTag: (path: string, tag: string) => invoke<void>("remove_tag", { path, tag }),
  searchByTags: (tags: string[]) => invoke<string[]>("search_by_tags", { tags }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a local file path to a URL loadable in <img> / <video> tags. */
export { convertFileSrc };

/** Format bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Format ISO datetime string to display string. */
export function formatDate(iso: string): string {
  if (!iso || iso.startsWith("1970")) return "—";
  return iso.replace("T", " ");
}
