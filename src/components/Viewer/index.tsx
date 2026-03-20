import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "../../store";
import { commands } from "../../lib/tauri";
import ParallaxViewer from "../ParallaxViewer";

type Transform = { scale: number; x: number; y: number; rotate: number; flipX: boolean; flipY: boolean };
const DEFAULT_TRANSFORM: Transform = { scale: 1, x: 0, y: 0, rotate: 0, flipX: false, flipY: false };

function getMimeType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", bmp: "image/bmp", gif: "image/gif",
  };
  return map[ext] ?? "image/jpeg";
}

// ── Ken Burns ────────────────────────────────────────────────────────
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

// ── Slide durations ──────────────────────────────────────────────────
const SLIDE_DURATION = 280; // ms

export default function Viewer() {
  const {
    selectedFile, selectNext, selectPrev, closeViewer,
    isFullscreen, setFullscreen, setCurrentMetadata, toggleInfoPanel,
    slideshowActive, slideshowInterval, slideDirection,
  } = useAppStore();

  // ── Parallax viewer ──────────────────────────────────────────────
  const [showParallax, setShowParallax] = useState(false);

  // ── Manual transform (zoom / pan / rotate) ───────────────────────
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Shared URL state (both slideshow and normal viewer) ──────────
  const [currentUrl, setCurrentUrl]   = useState<string | null>(null);
  const [prevUrl,    setPrevUrl]       = useState<string | null>(null);
  const currUrlRef = useRef<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const prevTimer  = useRef<number | null>(null);

  // ── Slideshow Ken Burns ──────────────────────────────────────────
  const kbMoveRef       = useRef<[Keyframe, Keyframe]>(KB_MOVES[0]);
  const kbExitTransform = useRef<string>("none");
  const kbAnimRef       = useRef<Animation | null>(null);

  // ── Normal-viewer slide ──────────────────────────────────────────
  const [isSliding, setIsSliding]     = useState(false);
  const slideDir       = useRef<"prev" | "next">("next"); // captured at load time
  const cssTransformRef = useRef<string>("");             // kept in sync for exit capture

  // ── DOM refs ─────────────────────────────────────────────────────
  const imgRef             = useRef<HTMLImageElement>(null);
  const prevLayerRef       = useRef<HTMLDivElement>(null);
  const slideInWrapperRef  = useRef<HTMLDivElement>(null); // slide target (not the img)

  // ─────────────────────────────────────────────────────────────────
  // Compute cssTransform string (used for manual viewer transform)
  // ─────────────────────────────────────────────────────────────────
  const cssTransform = [
    `translate(${transform.x}px, ${transform.y}px)`,
    `scale(${transform.scale})`,
    `rotate(${transform.rotate}deg)`,
    `scaleX(${transform.flipX ? -1 : 1})`,
    `scaleY(${transform.flipY ? -1 : 1})`,
  ].join(" ");

  useEffect(() => { cssTransformRef.current = cssTransform; }, [cssTransform]);

  // Reset manual transform when file changes
  useEffect(() => { setTransform(DEFAULT_TRANSFORM); }, [selectedFile?.path]);

  // ─────────────────────────────────────────────────────────────────
  // Load image URL (handles both slideshow and normal viewer)
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;

    readFile(selectedFile.path)
      .then((data) => {
        if (cancelled) return;
        const newUrl = URL.createObjectURL(
          new Blob([data], { type: getMimeType(selectedFile.path) })
        );

        // Clear pending prev cleanup
        if (prevTimer.current !== null) { clearTimeout(prevTimer.current); prevTimer.current = null; }

        // Revoke old prev immediately
        if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); }

        if (slideshowActive) {
          // Ken Burns: capture exit transform and pre-select next move
          if (imgRef.current) kbExitTransform.current = window.getComputedStyle(imgRef.current).transform;
          kbMoveRef.current = KB_MOVES[Math.floor(Math.random() * KB_MOVES.length)];
        } else {
          // Normal viewer: capture current direction
          slideDir.current = slideDirection;
        }

        prevUrlRef.current = currUrlRef.current;
        currUrlRef.current = newUrl;

        const hasPrev = !!prevUrlRef.current;
        setPrevUrl(prevUrlRef.current);
        setCurrentUrl(newUrl);
        if (!slideshowActive) setIsSliding(hasPrev);

        // Schedule prev URL cleanup
        prevTimer.current = window.setTimeout(() => {
          if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = null; }
          setPrevUrl(null);
          prevTimer.current = null;
        }, slideshowActive ? 1100 : SLIDE_DURATION + 500);
      })
      .catch(console.error);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile?.path, slideshowActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevTimer.current !== null) clearTimeout(prevTimer.current);
      if (currUrlRef.current) URL.revokeObjectURL(currUrlRef.current);
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  // Cleanup when leaving slideshow
  useEffect(() => {
    if (!slideshowActive) {
      kbAnimRef.current?.cancel();
      setIsSliding(false);
    }
  }, [slideshowActive]);

  // ─────────────────────────────────────────────────────────────────
  // Ken Burns animation (slideshow only)
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slideshowActive || !imgRef.current || !currentUrl) return;
    kbAnimRef.current?.cancel();
    const [from, to] = kbMoveRef.current;
    kbAnimRef.current = imgRef.current.animate([from, to], {
      duration: slideshowInterval * 1000,
      easing: "ease-in-out",
      fill: "forwards",
    });
    return () => { kbAnimRef.current?.cancel(); };
  }, [currentUrl, slideshowActive, slideshowInterval]);

  // Fade-out animation for previous layer (slideshow)
  useEffect(() => {
    if (!slideshowActive || !prevUrl || !prevLayerRef.current) return;
    const anim = prevLayerRef.current.animate(
      [{ opacity: "1" }, { opacity: "0" }],
      { duration: 900, easing: "ease-in-out", fill: "forwards" }
    );
    return () => anim.cancel();
  }, [prevUrl, slideshowActive]);

  // ─────────────────────────────────────────────────────────────────
  // Slide-in animation (useLayoutEffect で paint 前に開始 → 確実に動作)
  // ─────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (slideshowActive || !isSliding || !currentUrl || !slideInWrapperRef.current) return;
    const el = slideInWrapperRef.current;
    const fromX = slideDir.current === "next" ? "100%" : "-100%";

    // 開始位置をトランジションなしで設定
    el.style.transition = "none";
    el.style.transform = `translateX(${fromX})`;
    // リフロー強制 → ブラウザが開始位置をコミット
    void el.offsetWidth;
    // トランジション開始
    el.style.transition = `transform ${SLIDE_DURATION}ms ease-out`;
    el.style.transform = "translateX(0)";

    const done = () => setIsSliding(false);
    el.addEventListener("transitionend", done, { once: true });
    return () => {
      el.removeEventListener("transitionend", done);
      el.style.transition = "";
      el.style.transform = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, isSliding, slideshowActive]);

  // Slide-out animation for outgoing image (normal viewer)
  useLayoutEffect(() => {
    if (slideshowActive || !prevUrl || !prevLayerRef.current) return;
    const el = prevLayerRef.current;
    const toX = slideDir.current === "next" ? "-100%" : "100%";
    el.style.transition = `transform ${SLIDE_DURATION}ms ease-out`;
    el.style.transform = `translateX(${toX})`;
    return () => {
      el.style.transition = "";
      el.style.transform = "";
    };
  }, [prevUrl, slideshowActive]);

  // ─────────────────────────────────────────────────────────────────
  // Metadata fetch
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedFile) return;
    commands.getMetadata(selectedFile.path).then(setCurrentMetadata).catch(console.error);
  }, [selectedFile?.path]);

  // Slideshow interval timer
  useEffect(() => {
    if (!slideshowActive) return;
    const id = setInterval(() => selectNext(), slideshowInterval * 1000);
    return () => clearInterval(id);
  }, [slideshowActive, slideshowInterval, selectNext]);

  // ─────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case "+": case "=": e.preventDefault(); zoom(0.2); break;
        case "-":           e.preventDefault(); zoom(-0.2); break;
        case "0":           e.preventDefault(); setTransform(DEFAULT_TRANSFORM); break;
        case "r": case "R":
          if (!e.ctrlKey) { e.preventDefault(); setTransform((t) => ({ ...t, rotate: t.rotate + (e.shiftKey ? -90 : 90) })); }
          break;
        case "h": e.preventDefault(); setTransform((t) => ({ ...t, flipX: !t.flipX })); break;
        case "v": e.preventDefault(); setTransform((t) => ({ ...t, flipY: !t.flipY })); break;
        case "i": case "I": e.preventDefault(); toggleInfoPanel(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleInfoPanel]);

  const zoom = useCallback((delta: number) => {
    setTransform((t) => ({ ...t, scale: Math.max(0.1, Math.min(10, t.scale + delta)) }));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) { zoom(e.deltaY < 0 ? 0.15 : -0.15); return; }
    if (e.deltaY < 0) selectPrev(); else selectNext();
  }, [zoom, selectPrev, selectNext]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || slideshowActive || isSliding) return;
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform, slideshowActive, isSliding]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setTransform((t) => ({
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

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-[#111] overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {slideshowActive ? (
        /* ── Slideshow mode ──────────────────────────────────────── */
        <>
          {/* Current: blurred backdrop */}
          {currentUrl && (
            <img src={currentUrl} aria-hidden draggable={false} style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", filter: "blur(28px) brightness(0.4)",
              transform: "scale(1.08)", pointerEvents: "none", zIndex: 0,
            }} />
          )}
          {/* Current: main image with Ken Burns */}
          <img ref={imgRef} src={currentUrl ?? undefined} alt={selectedFile.name} draggable={false} style={{
            position: "relative", zIndex: 2,
            maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
            transformOrigin: "center center", cursor: "default", willChange: "transform",
            transform: kbMoveRef.current[0].transform as string, // initial KB position (no flash)
          }} />

          {/* Previous layer: fades out on top */}
          {prevUrl && (
            <div ref={prevLayerRef} style={{
              position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              <img src={prevUrl} aria-hidden draggable={false} style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", filter: "blur(28px) brightness(0.4)", transform: "scale(1.08)",
              }} />
              <img src={prevUrl} draggable={false} style={{
                position: "relative", maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                transformOrigin: "center center", transform: kbExitTransform.current,
              }} />
            </div>
          )}
        </>
      ) : (
        /* ── Normal viewer mode ──────────────────────────────────── */
        <>
          {/* Previous image: slides out */}
          {prevUrl && (
            <div ref={prevLayerRef} style={{
              position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              <img src={prevUrl} draggable={false} style={{
                maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
              }} />
            </div>
          )}

          {/* Wrapper div slides in; img inside handles zoom/pan independently */}
          <div ref={slideInWrapperRef} style={{
            position: "absolute", inset: 0, zIndex: 2,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img
              ref={imgRef}
              src={currentUrl ?? undefined}
              alt={selectedFile.name}
              draggable={false}
              style={{
                transform: cssTransform,
                cursor: isDragging ? "grabbing" : "grab",
                maxWidth: transform.scale === 1 ? "100%" : "none",
                maxHeight: transform.scale === 1 ? "100%" : "none",
                objectFit: "contain",
                transition: isDragging ? "none" : "transform 0.05s",
              }}
            />
          </div>
        </>
      )}

      <ViewerControls
        onPrev={selectPrev} onNext={selectNext} onClose={closeViewer}
        onZoomIn={() => zoom(0.2)} onZoomOut={() => zoom(-0.2)}
        onReset={() => setTransform(DEFAULT_TRANSFORM)}
        onRotate={() => setTransform((t) => ({ ...t, rotate: t.rotate + 90 }))}
        onFlipH={() => setTransform((t) => ({ ...t, flipX: !t.flipX }))}
        onFullscreen={() => setFullscreen(!isFullscreen)}
        onParallax={() => setShowParallax(true)}
        isFullscreen={isFullscreen} scale={transform.scale}
        fileName={selectedFile.name} slideshowActive={slideshowActive}
        isImage={selectedFile.fileType === "image"}
      />

      {showParallax && selectedFile.fileType === "image" && (
        <ParallaxViewer
          imagePath={selectedFile.path}
          onClose={() => setShowParallax(false)}
        />
      )}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────
interface ControlsProps {
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
  onRotate: () => void; onFlipH: () => void; onFullscreen: () => void;
  onParallax: () => void;
  isFullscreen: boolean; scale: number; fileName: string;
  slideshowActive: boolean; isImage: boolean;
}

function ViewerControls({ onPrev, onNext, onClose, onZoomIn, onZoomOut, onReset,
    onRotate, onFlipH, onFullscreen, onParallax,
    isFullscreen, scale, fileName, slideshowActive, isImage }: ControlsProps) {
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
              {isImage && (
                <CtrlBtn onClick={onParallax} title="パララックス効果">🌊</CtrlBtn>
              )}
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
