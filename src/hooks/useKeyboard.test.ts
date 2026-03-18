import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboard } from "./useKeyboard";
import { useAppStore } from "../store";
import { FileEntry } from "../lib/tauri";

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

beforeEach(() => {
  useAppStore.setState({
    files: [makeFile(), makeFile({ id: 2, path: "/test/b.jpg", name: "b.jpg" })],
    selectedIndex: 0,
    selectedFile: makeFile(),
    viewMode: "viewer",
    isFullscreen: false,
    slideshowActive: false,
    slideshowInterval: 3,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function fireKey(key: string, options?: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
}

describe("useKeyboard — viewer navigation", () => {
  it("ArrowRight advances selectedIndex in viewer mode", () => {
    renderHook(() => useKeyboard());

    fireKey("ArrowRight");

    expect(useAppStore.getState().selectedIndex).toBe(1);
  });

  it("ArrowLeft calls selectPrev in viewer mode", () => {
    useAppStore.setState({ selectedIndex: 1, selectedFile: makeFile({ id: 2, path: "/test/b.jpg", name: "b.jpg" }) });
    renderHook(() => useKeyboard());

    fireKey("ArrowLeft");

    expect(useAppStore.getState().selectedIndex).toBe(0);
  });
});

describe("useKeyboard — fullscreen", () => {
  it("F key toggles fullscreen", () => {
    renderHook(() => useKeyboard());

    expect(useAppStore.getState().isFullscreen).toBe(false);
    fireKey("f");
    expect(useAppStore.getState().isFullscreen).toBe(true);
    fireKey("f");
    expect(useAppStore.getState().isFullscreen).toBe(false);
  });

  it("Esc key turns off fullscreen if active", () => {
    useAppStore.setState({ isFullscreen: true });
    renderHook(() => useKeyboard());

    fireKey("Escape");

    expect(useAppStore.getState().isFullscreen).toBe(false);
  });

  it("Esc key closes viewer if not in fullscreen", () => {
    useAppStore.setState({ isFullscreen: false, viewMode: "viewer" });
    renderHook(() => useKeyboard());

    fireKey("Escape");

    expect(useAppStore.getState().viewMode).toBe("gallery");
  });
});

describe("useKeyboard — ignores input elements", () => {
  it("does not navigate when typing in an input", () => {
    renderHook(() => useKeyboard());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const indexBefore = useAppStore.getState().selectedIndex;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    // selectedIndex should be unchanged because event originated from an input element
    expect(useAppStore.getState().selectedIndex).toBe(indexBefore);
    document.body.removeChild(input);
  });
});
