import { useEffect } from "react";
import { useAppStore } from "../store";

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Always read fresh state from store to avoid stale closures
      const store = useAppStore.getState();

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          if (store.viewMode === "gallery" && e.shiftKey) {
            const next = Math.min(store.selectedIndex + 1, store.files.length - 1);
            if (store.selectedIndex >= 0) store.shiftSelectRange(next);
          } else if (store.viewMode !== "gallery") {
            store.selectNext();
          }
          break;

        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          if (store.viewMode === "gallery" && e.shiftKey) {
            const prev = Math.max(store.selectedIndex - 1, 0);
            if (store.selectedIndex >= 0) store.shiftSelectRange(prev);
          } else if (store.viewMode !== "gallery") {
            store.selectPrev();
          }
          break;

        case " ":
          e.preventDefault();
          if (store.viewMode === "viewer" || store.viewMode === "gallery") {
            store.toggleSlideshow();
          }
          break;

        case "f":
        case "F":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.setFullscreen(!store.isFullscreen);
          }
          break;

        case "Escape":
          if (store.isScanning) {
            store.cancelScan();
          } else if (store.isFullscreen) {
            store.setFullscreen(false);
          } else if (store.viewMode !== "gallery") {
            store.closeViewer();
          }
          break;

        case "i":
        case "I":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.toggleInfoPanel();
          }
          break;

        case "Enter":
          if (store.viewMode === "gallery" && store.selectedIndex >= 0) {
            e.preventDefault();
            store.openFile(store.selectedIndex);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // Empty deps: handler always reads fresh state via getState()
}
