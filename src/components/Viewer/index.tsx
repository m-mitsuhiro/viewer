import { useEffect, useRef, useState, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "../../store";
import { useFileUrl } from "../../hooks/useFileUrl";
import { commands } from "../../lib/tauri";

// ─── Types / constants ────────────────────────────────────────────────
type Transform = { scale: number; x: number; y: number; rotate: number; flipX: boolean; flipY: boolean };
const DEFAULT_TRANSFORM: Transform = { scale: 1, x: 0, y: 0, rotate: 0, flipX: false, flipY: false };
const SLIDE_MS = 280;

function getMimeType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", bmp: "image/bmp", gif: "image/gif",
  };
  return map[ext] ?? "image/jpeg";
}

// ─── Ken Burns (slideshow) ────────────────────────────────────────────
const KB_MOVES: [Keyframe, Keyframe][] = [
  [{ transform: "scale(1.0) translate(0%,   0%)"  }, { transform: "scale(1.2) translate(-4%, -4%)" }],
  [{ transform: "scale(1.2) translate(4%,   4%)"  }, { transform: "scale(1.0) translate(-4%, -4%)" }],
  [{ transform: "scale(1.0) translate(-4%,  0%)"  }, { transform: "scale(1.2) translate( 4%,  0%)" }],
  [{ transform: "scale(1.2) translate(4%,  -3%)"  }, { transform: "scale(1.0) translate(-4%,  3%)" }],
  [{ transform: "scale(1.0) translate(0%,   4%)"  }, { transform: "scale(1.2) translate( 0%, -4%)" }],
  [{ transform: "scale(1.2) translate(-4%,  3%)"  }, { transform: "scale(1.0) translate( 4%, -3%)" }],
  [{ transform: "scale(1.0) translate(3%,  -3%)"  }, { transform: "scale(1.2) translate(-3%,  3%)" }],
  [{ transform: "scale(1.15) translate(0%,  0%)"  }, { transform: "scale(1.0) translate( 3%,  3%)" }],
];

// ─────────────────────────────────────────────────────────────────────
export default function Viewer() {
  const {
    selectedFile, selectNext, selectPrev, closeViewer,
    isFullscreen, setFullscreen, setCurrentMetadata, toggleInfoPanel,
    slideshowActive, slideshowInterval,
  } = useAppStore();

  // ── Manual transform (zoom / pan / rotate) ─────────────────────────
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);

  const cssTransform = [
    `translate(${transform.x}px, ${transform.y}px)`,
    `scale(${transform.scale})`,
    `rotate(${transform.rotate}deg)`,
    `scaleX(${transform.flipX ? -1 : 1})`,
    `scaleY(${transform.flipY ? -1 : 1})`,
  ].join(" ");

  // ── Normal viewer: single URL via hook ─────────────────────────────
  const currentUrl = useFileUrl(slideshowActive ? null : selectedFile?.path);

  // ── Slide animation on URL change ──────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const prevUrlRef   = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUrl || !wrapperRef.current || !containerRef.current) return;
    if (!prevUrlRef.current) {
      // First load — no animation
      prevUrlRef.current = currentUrl;
      return;
    }
    prevUrlRef.current = currentUrl;
    const cw  = containerRef.current.offsetWidth;
    const dir = useAppStore.getState().slideDirection;
    const fromX = dir === "next" ? cw : -cw;
    wrapperRef.current.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: "translateX(0px)" }],
      { duration: SLIDE_MS, easing: "ease-out", fill: "forwards" },
    );
  }, [currentUrl]);

  // ── Reset transform on file change ────────────────────────────────
  useEffect(() => { setTransform(DEFAULT_TRANSFORM); }, [selectedFile?.path]);

  // ── Slideshow URL state ────────────────────────────────────────────
  const [sfCurrentUrl, setSfCurrentUrl] = useState<string | null>(null);
  const [sfPrevUrl, setSfPrevUrl]       = useState<string | null>(null);
  const sfCurrRef      = useRef<string | null>(null);
  const sfPrevRef      = useRef<string | null>(null);
  const prevFadeTimer  = useRef<number | null>(null);
  const kbMoveRef      = useRef<[Keyframe, Keyframe]>(KB_MOVES[0]);
  const kbExitTransform = useRef<string>("none");
  const kbAnimRef      = useRef<Animation | null>(null);
  const sfImgRef       = useRef<HTMLImageElement>(null);
  const sfPrevLayerRef = useRef<HTMLDivElement>(null);

  // ── Slideshow URL loading + Ken Burns ─────────────────────────────
  useEffect(() => {
    if (!slideshowActive || !selectedFile) return;
    let cancelled = false;

    readFile(selectedFile.path)
      .then(data => {
        if (cancelled) return;
        const newUrl = URL.createObjectURL(new Blob([data], { type: getMimeType(selectedFile.path) }));

        if (prevFadeTimer.current !== null) { clearTimeout(prevFadeTimer.current); prevFadeTimer.current = null; }
        if (sfPrevRef.current) URL.revokeObjectURL(sfPrevRef.current);

        if (sfImgRef.current) kbExitTransform.current = window.getComputedStyle(sfImgRef.current).transform;
        kbMoveRef.current = KB_MOVES[Math.floor(Math.random() * KB_MOVES.length)];

        sfPrevRef.current = sfCurrRef.current;
        sfCurrRef.current = newUrl;
        setSfPrevUrl(sfPrevRef.current);
        setSfCurrentUrl(newUrl);

        prevFadeTimer.current = window.setTimeout(() => {
          if (sfPrevRef.current) { URL.revokeObjectURL(sfPrevRef.current); sfPrevRef.current = null; }
          setSfPrevUrl(null);
          prevFadeTimer.current = null;
        }, 1100);
      }).catch(console.error);

    return () => { cancelled = true; };
  }, [selectedFile?.path, slideshowActive]);

  useEffect(() => {
    if (!slideshowActive) {
      kbAnimRef.current?.cancel();
      if (prevFadeTimer.current !== null) { clearTimeout(prevFadeTimer.current); prevFadeTimer.current = null; }
    }
  }, [slideshowActive]);

  useEffect(() => {
    return () => {
      if (prevFadeTimer.current !== null) clearTimeout(prevFadeTimer.current);
      if (sfCurrRef.current) URL.revokeObjectURL(sfCurrRef.current);
      if (sfPrevRef.current) URL.revokeObjectURL(sfPrevRef.current);
    };
  }, []);

  useEffect(() => {
    if (!slideshowActive || !sfImgRef.current || !sfCurrentUrl) return;
    kbAnimRef.current?.cancel();
    const [from, to] = kbMoveRef.current;
    kbAnimRef.current = sfImgRef.current.animate([from, to], {
      duration: slideshowInterval * 1000, easing: "ease-in-out", fill: "forwards",
    });
    return () => { kbAnimRef.current?.cancel(); };
  }, [sfCurrentUrl, slideshowActive, slideshowInterval]);

  useEffect(() => {
    if (!slideshowActive || !sfPrevUrl || !sfPrevLayerRef.current) return;
    const anim = sfPrevLayerRef.current.animate(
      [{ opacity: "1" }, { opacity: "0" }],
      { duration: 900, easing: "ease-in-out", fill: "forwards" },
    );
    return () => anim.cancel();
  }, [sfPrevUrl, slideshowActive]);

  // Slideshow interval timer
  useEffect(() => {
    if (!slideshowActive) return;
    const id = setInterval(() => selectNext(), slideshowInterval * 1000);
    return () => clearInterval(id);
  }, [slideshowActive, slideshowInterval, selectNext]);

  // ── Metadata ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedFile) return;
    commands.getMetadata(selectedFile.path).then(setCurrentMetadata).catch(console.error);
  }, [selectedFile?.path]);

  // ── Keyboard shortcuts (zoom / rotate — arrows handled by useKeyboard) ──
  const zoom = useCallback((delta: number) => {
    setTransform(t => ({ ...t, scale: Math.max(0.1, Math.min(10, t.scale + delta)) }));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case "+": case "=": e.preventDefault(); zoom(0.2); break;
        case "-":           e.preventDefault(); zoom(-0.2); break;
        case "0":           e.preventDefault(); setTransform(DEFAULT_TRANSFORM); break;
        case "r": case "R":
          if (!e.ctrlKey) { e.preventDefault(); setTransform(t => ({ ...t, rotate: t.rotate + (e.shiftKey ? -90 : 90) })); }
          break;
        case "h": e.preventDefault(); setTransform(t => ({ ...t, flipX: !t.flipX })); break;
        case "v": e.preventDefault(); setTransform(t => ({ ...t, flipY: !t.flipY })); break;
        case "i": case "I": e.preventDefault(); toggleInfoPanel(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom, toggleInfoPanel]);

  // ── Mouse / touch handlers ────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) { zoom(e.deltaY < 0 ? 0.15 : -0.15); return; }
    if (e.deltaY < 0) selectPrev(); else selectNext();
  }, [zoom, selectPrev, selectNext]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || slideshowActive) return;
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform, slideshowActive]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setTransform(t => ({
      ...t,
      x: dragStart.current!.tx + e.clientX - dragStart.current!.mx,
      y: dragStart.current!.ty + e.clientY - dragStart.current!.my,
    }));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  if (!selectedFile) {
    return <div className="flex items-center justify-center h-full text-[#757575]">ファイルが選択されていません</div>;
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#111] overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {slideshowActive ? (
        /* ── Slideshow mode ──────────────────────────────────────── */
        <>
          {sfCurrentUrl && (
            <img src={sfCurrentUrl} aria-hidden draggable={false} style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", filter: "blur(28px) brightness(0.4)",
              transform: "scale(1.08)", pointerEvents: "none", zIndex: 0,
            }} />
          )}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            <img ref={sfImgRef} src={sfCurrentUrl ?? undefined} alt={selectedFile.name} draggable={false}
              style={{
                maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                transformOrigin: "center center", cursor: "default", willChange: "transform",
                transform: kbMoveRef.current[0].transform as string,
              }}
            />
          </div>
          {sfPrevUrl && (
            <div ref={sfPrevLayerRef} style={{
              position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              <img src={sfPrevUrl} aria-hidden draggable={false} style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", filter: "blur(28px) brightness(0.4)", transform: "scale(1.08)",
              }} />
              <img src={sfPrevUrl} draggable={false} style={{
                position: "relative", maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                transformOrigin: "center center", transform: kbExitTransform.current,
              }} />
            </div>
          )}
        </>
      ) : (
        /* ── Normal viewer: single image with slide-in animation ─── */
        <div
          ref={wrapperRef}
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {currentUrl && (
            <img
              src={currentUrl}
              alt={selectedFile.name}
              draggable={false}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                cursor: isDragging ? "grabbing" : "grab",
                transform: cssTransform,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 0.05s",
              }}
            />
          )}
        </div>
      )}

      <ViewerControls
        onPrev={selectPrev}
        onNext={selectNext}
        onClose={closeViewer}
        onZoomIn={() => zoom(0.2)}
        onZoomOut={() => zoom(-0.2)}
        onReset={() => setTransform(DEFAULT_TRANSFORM)}
        onRotate={() => setTransform(t => ({ ...t, rotate: t.rotate + 90 }))}
        onFlipH={() => setTransform(t => ({ ...t, flipX: !t.flipX }))}
        onFullscreen={() => setFullscreen(!isFullscreen)}
        isFullscreen={isFullscreen}
        scale={transform.scale}
        fileName={selectedFile.name}
        slideshowActive={slideshowActive}
      />
    </div>
  );
}

// ─── Controls ─────────────────────────────────────────────────────────
interface ControlsProps {
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
  onRotate: () => void; onFlipH: () => void; onFullscreen: () => void;
  isFullscreen: boolean; scale: number; fileName: string; slideshowActive: boolean;
}

function ViewerControls({ onPrev, onNext, onClose, onZoomIn, onZoomOut, onReset,
    onRotate, onFlipH, onFullscreen, isFullscreen, scale, fileName, slideshowActive }: ControlsProps) {
  return (
    <>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" style={{ zIndex: 10 }}>
        <span className="text-sm text-white/80 truncate">{fileName}</span>
        <div className="flex gap-2 pointer-events-auto">
          {!slideshowActive && (
            <>
              <CtrlBtn onClick={onZoomOut} title="縮小 (-)">－</CtrlBtn>
              <span className="text-white/70 text-xs flex items-center">{Math.round(scale * 100)}%</span>
              <CtrlBtn onClick={onZoomIn} title="拡大 (+)">＋</CtrlBtn>
              <CtrlBtn onClick={onReset} title="リセット (0)">⊞</CtrlBtn>
              <CtrlBtn onClick={onRotate} title="回転 (R)">↻</CtrlBtn>
              <CtrlBtn onClick={onFlipH} title="左右反転 (H)">⇆</CtrlBtn>
            </>
          )}
          <CtrlBtn onClick={onFullscreen} title="フルスクリーン (F)">{isFullscreen ? "⊠" : "⊡"}</CtrlBtn>
          <CtrlBtn onClick={onClose} title="閉じる (Esc)">✕</CtrlBtn>
        </div>
      </div>
      <button onClick={onPrev} style={{ zIndex: 10 }}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center text-xl transition-opacity opacity-0 hover:opacity-100 focus:opacity-100"
        title="前へ (←)">‹</button>
      <button onClick={onNext} style={{ zIndex: 10 }}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center text-xl transition-opacity opacity-0 hover:opacity-100 focus:opacity-100"
        title="次へ (→)">›</button>
    </>
  );
}

function CtrlBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 rounded bg-black/40 hover:bg-black/70 text-white text-sm flex items-center justify-center">
      {children}
    </button>
  );
}
