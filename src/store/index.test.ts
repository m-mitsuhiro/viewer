import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";
import { FileEntry } from "../lib/tauri";

// Reset store before each test
beforeEach(() => {
  useAppStore.setState({
    files: [],
    selectedIndex: -1,
    selectedFile: null,
    currentFolder: null,
    viewMode: "gallery",
    isFullscreen: false,
    searchQuery: "",
    fileTypeFilter: "all",
    tagFilter: [],
    infoPanelOpen: false,
    currentMetadata: null,
    slideshowActive: false,
    slideshowInterval: 3,
    isScanning: false,
  });
});

const makeFile = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  id: 1,
  path: "/test/image.jpg",
  name: "image.jpg",
  fileType: "image",
  size: 1024,
  modifiedAt: "2024-01-01T00:00:00",
  tags: [],
  ...overrides,
});

describe("useAppStore — file selection", () => {
  it("selectFile sets selectedIndex and selectedFile", () => {
    const files = [makeFile(), makeFile({ id: 2, path: "/test/b.jpg", name: "b.jpg" })];
    useAppStore.setState({ files });

    useAppStore.getState().selectFile(1);

    const { selectedIndex, selectedFile } = useAppStore.getState();
    expect(selectedIndex).toBe(1);
    expect(selectedFile?.path).toBe("/test/b.jpg");
  });

  it("selectNext advances index", () => {
    const files = [makeFile(), makeFile({ id: 2, path: "/test/b.jpg", name: "b.jpg" })];
    useAppStore.setState({ files, selectedIndex: 0, selectedFile: files[0] });

    useAppStore.getState().selectNext();

    expect(useAppStore.getState().selectedIndex).toBe(1);
  });

  it("selectNext does not go beyond last file", () => {
    const files = [makeFile()];
    useAppStore.setState({ files, selectedIndex: 0, selectedFile: files[0] });

    useAppStore.getState().selectNext();

    expect(useAppStore.getState().selectedIndex).toBe(0);
  });

  it("selectPrev does not go below 0", () => {
    const files = [makeFile(), makeFile({ id: 2, path: "/test/b.jpg", name: "b.jpg" })];
    useAppStore.setState({ files, selectedIndex: 0, selectedFile: files[0] });

    useAppStore.getState().selectPrev();

    expect(useAppStore.getState().selectedIndex).toBe(0);
  });

  it("setFiles resets selection", () => {
    useAppStore.setState({ selectedIndex: 3, selectedFile: makeFile() });

    useAppStore.getState().setFiles([makeFile()]);

    const { selectedIndex, selectedFile } = useAppStore.getState();
    expect(selectedIndex).toBe(-1);
    expect(selectedFile).toBeNull();
  });
});

describe("useAppStore — view mode", () => {
  it("openFile sets viewMode to viewer for image", () => {
    const files = [makeFile({ fileType: "image" })];
    useAppStore.setState({ files });

    useAppStore.getState().openFile(0);

    expect(useAppStore.getState().viewMode).toBe("viewer");
  });

  it("openFile sets viewMode to player for video", () => {
    const files = [makeFile({ fileType: "video", name: "video.mp4" })];
    useAppStore.setState({ files });

    useAppStore.getState().openFile(0);

    expect(useAppStore.getState().viewMode).toBe("player");
  });

  it("closeViewer resets to gallery mode", () => {
    useAppStore.setState({ viewMode: "viewer", isFullscreen: true, slideshowActive: true });

    useAppStore.getState().closeViewer();

    const { viewMode, isFullscreen, slideshowActive } = useAppStore.getState();
    expect(viewMode).toBe("gallery");
    expect(isFullscreen).toBe(false);
    expect(slideshowActive).toBe(false);
  });
});

describe("useAppStore — slideshow", () => {
  it("toggleSlideshow activates and deactivates", () => {
    expect(useAppStore.getState().slideshowActive).toBe(false);

    useAppStore.getState().toggleSlideshow();
    expect(useAppStore.getState().slideshowActive).toBe(true);

    useAppStore.getState().toggleSlideshow();
    expect(useAppStore.getState().slideshowActive).toBe(false);
  });
});

describe("useAppStore — info panel", () => {
  it("toggleInfoPanel flips infoPanelOpen", () => {
    expect(useAppStore.getState().infoPanelOpen).toBe(false);

    useAppStore.getState().toggleInfoPanel();
    expect(useAppStore.getState().infoPanelOpen).toBe(true);

    useAppStore.getState().toggleInfoPanel();
    expect(useAppStore.getState().infoPanelOpen).toBe(false);
  });
});
