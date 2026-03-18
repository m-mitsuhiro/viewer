import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "../../store";
import { useFileUrl } from "../../hooks/useFileUrl";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export default function Player() {
  const { selectedFile, selectNext, selectPrev, closeViewer, isFullscreen, setFullscreen } =
    useAppStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<number | null>(null);

  const src = useFileUrl(selectedFile?.path);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2500);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
  }, [volume]);

  // Keyboard shortcuts for player
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            selectNext();
          } else {
            v.currentTime = Math.min(v.duration, v.currentTime + 5);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            selectPrev();
          } else {
            v.currentTime = Math.max(0, v.currentTime - 5);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((vol) => Math.min(1, vol + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((vol) => Math.max(0, vol - 0.1));
          break;
        case "m":
        case "M":
          e.preventDefault();
          if (v) v.muted = !v.muted;
          break;
        case "l":
        case "L":
          e.preventDefault();
          setIsLooping((l) => !l);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectNext, selectPrev]);

  if (!selectedFile || !src) {
    return (
      <div className="flex items-center justify-center h-full text-[#757575]">
        ファイルが選択されていません
      </div>
    );
  }

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden"
      onMouseMove={resetControlsTimer}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        loop={isLooping}
        className="max-w-full max-h-full"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => {
          if (!isLooping) selectNext();
        }}
      />

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="px-4 pb-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            step={0.1}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="w-full h-1 accent-[#4a9eff] cursor-pointer"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 px-4 pb-3">
          {/* Prev */}
          <PlayerBtn onClick={selectPrev} title="前へ (Shift+←)">⏮</PlayerBtn>
          {/* Play/Pause */}
          <PlayerBtn onClick={togglePlay} title="再生/一時停止 (Space)">
            {isPlaying ? "⏸" : "▶"}
          </PlayerBtn>
          {/* Next */}
          <PlayerBtn onClick={selectNext} title="次へ (Shift+→)">⏭</PlayerBtn>

          {/* Time */}
          <span className="text-white text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Loop */}
          <PlayerBtn
            onClick={() => setIsLooping((l) => !l)}
            title="ループ (L)"
            active={isLooping}
          >
            🔁
          </PlayerBtn>

          {/* Speed */}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-black/50 text-white text-xs border border-[#444] rounded px-1 py-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>

          {/* Volume */}
          <div className="flex items-center gap-1">
            <span className="text-white text-xs">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-16 h-1 accent-[#4a9eff] cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Fullscreen */}
          <PlayerBtn onClick={() => setFullscreen(!isFullscreen)} title="フルスクリーン (F)">
            {isFullscreen ? "⊠" : "⊡"}
          </PlayerBtn>
          {/* Close */}
          <PlayerBtn onClick={closeViewer} title="閉じる (Esc)">✕</PlayerBtn>
        </div>
      </div>

      {/* Filename */}
      <div
        className={`absolute top-0 left-0 right-0 px-4 py-2 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300 pointer-events-none ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-white/80 text-sm truncate block">{selectedFile.name}</span>
      </div>
    </div>
  );
}

function PlayerBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`text-base px-1 rounded hover:bg-white/10 transition-colors ${
        active ? "text-[#4a9eff]" : "text-white"
      }`}
    >
      {children}
    </button>
  );
}
