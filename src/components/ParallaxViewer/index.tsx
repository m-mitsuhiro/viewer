import { useEffect, useRef, useState, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

// ── WebGL shader sources ───────────────────────────────────────────────────
const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
}`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_depth;
uniform vec2 u_shift;
uniform float u_zoom;
void main() {
  // Scale toward center by zoom to create padding (hides edge artifacts)
  vec2 uv = (v_uv - 0.5) / u_zoom + 0.5;
  float depth = texture2D(u_depth, uv).r;
  // Near objects (depth≈1) shift more; far objects (depth≈0) stay still
  vec2 displaced = uv - u_shift * depth;
  gl_FragColor = texture2D(u_image, displaced);
}`;

// ── WebGL helpers ──────────────────────────────────────────────────────────
function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function createProgram(gl: WebGLRenderingContext) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  return prog;
}

function uploadTexture(
  gl: WebGLRenderingContext,
  unit: number,
  source: HTMLImageElement | ImageBitmap
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return tex;
}

function uploadDepthTexture(
  gl: WebGLRenderingContext,
  unit: number,
  data: Float32Array,
  w: number,
  h: number
): WebGLTexture {
  const uint8 = new Uint8Array(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    const v = Math.round(data[i] * 255);
    uint8[i * 4] = v;
    uint8[i * 4 + 1] = v;
    uint8[i * 4 + 2] = v;
    uint8[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8);
  return tex;
}

// ── Types ──────────────────────────────────────────────────────────────────
type Stage = "idle" | "loading" | "ready" | "error";
type AnimMode = "auto" | "mouse";

interface Props {
  imagePath: string;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ParallaxViewer({ imagePath, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const shiftRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 }); // tx/ty = target
  const timeRef = useRef(0);

  const [stage, setStage] = useState<Stage>("idle");
  const [statusMsg, setStatusMsg] = useState("初期化中...");
  const [animMode, setAnimMode] = useState<AnimMode>("auto");
  const [maxShift, setMaxShift] = useState(0.03);

  // ── Load image and run depth estimation ──────────────────────────────────
  useEffect(() => {
    setStage("loading");
    setStatusMsg("画像を読み込み中...");

    let cancelled = false;
    let blobUrl = "";

    (async () => {
      try {
        // Load image as data URL
        const bytes = await readFile(imagePath);
        const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
        const mime =
          ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const blob = new Blob([bytes], { type: mime });
        blobUrl = URL.createObjectURL(blob);

        // Load into HTMLImageElement to get natural dimensions
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = rej;
          img.src = blobUrl;
        });
        if (cancelled) return;

        // Init WebGL
        const canvas = canvasRef.current!;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const gl = canvas.getContext("webgl")!;
        glRef.current = gl;

        const prog = createProgram(gl);
        progRef.current = prog;
        gl.useProgram(prog);

        // Full-screen quad
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW
        );
        const aPos = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        // Upload image texture (unit 0)
        uploadTexture(gl, 0, img);
        gl.uniform1i(gl.getUniformLocation(prog, "u_image"), 0);

        // Convert to data URL for worker (resize to max 512px for speed)
        const maxDim = 512;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const oc = document.createElement("canvas");
        oc.width = Math.round(img.naturalWidth * scale);
        oc.height = Math.round(img.naturalHeight * scale);
        oc.getContext("2d")!.drawImage(img, 0, 0, oc.width, oc.height);
        const dataUrl = oc.toDataURL("image/jpeg", 0.9);

        if (cancelled) return;

        // Start worker
        const worker = new Worker(
          new URL("../../workers/depth.worker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current = worker;

        worker.onmessage = (e) => {
          if (cancelled) return;
          const { type, message, depthMap, width, height } = e.data;
          if (type === "status") {
            setStatusMsg(message);
          } else if (type === "progress") {
            const pct =
              e.data.total > 0
                ? Math.round((e.data.loaded / e.data.total) * 100)
                : 0;
            setStatusMsg(`${e.data.name ?? "モデル"} ダウンロード中... ${pct}%`);
          } else if (type === "result") {
            // Upload depth texture (unit 1)
            uploadDepthTexture(gl, 1, depthMap as Float32Array, width, height);
            gl.uniform1i(gl.getUniformLocation(prog!, "u_depth"), 1);
            setStage("ready");
            startRenderLoop();
          } else if (type === "error") {
            setStatusMsg(`エラー: ${message}`);
            setStage("error");
          }
        };

        worker.postMessage({ type: "estimate", imageDataUrl: dataUrl });
      } catch (err) {
        if (!cancelled) {
          setStatusMsg(`読み込みエラー: ${err}`);
          setStage("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      workerRef.current?.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagePath]);

  // ── Render loop ──────────────────────────────────────────────────────────
  const startRenderLoop = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    if (!gl || !prog) return;

    const uShift = gl.getUniformLocation(prog, "u_shift");
    const uZoom = gl.getUniformLocation(prog, "u_zoom");
    const ZOOM = 1.08;

    let last = performance.now();

    const render = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const s = shiftRef.current;
      if (animMode === "auto") {
        // Gentle sinusoidal drift
        s.tx = Math.sin(t * 0.5) * maxShift;
        s.ty = Math.sin(t * 0.31 + 1.0) * maxShift * 0.6;
      }
      // Smooth lerp toward target
      s.x += (s.tx - s.x) * Math.min(1, dt * 6);
      s.y += (s.ty - s.y) * Math.min(1, dt * 6);

      const canvas = canvasRef.current!;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uShift, s.x, s.y);
      gl.uniform1f(uZoom, ZOOM);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
  }, [animMode, maxShift]);

  // Restart render loop when mode/shift changes
  useEffect(() => {
    if (stage !== "ready") return;
    cancelAnimationFrame(rafRef.current);
    startRenderLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [stage, animMode, maxShift, startRenderLoop]);

  // ── Mouse parallax ───────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (animMode !== "mouse" || stage !== "ready") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      shiftRef.current.tx = nx * maxShift * 2;
      shiftRef.current.ty = ny * maxShift * 2;
    },
    [animMode, stage, maxShift]
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onMouseMove={handleMouseMove}
    >
      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full"
          style={{ display: stage === "ready" ? "block" : "none" }}
        />
        {stage !== "ready" && (
          <div className="flex flex-col items-center gap-4 text-white">
            {stage === "error" ? (
              <span className="text-[#ff6b6b] text-sm text-center max-w-xs">{statusMsg}</span>
            ) : (
              <>
                <div className="w-10 h-10 border-4 border-[#333] border-t-[#4a9eff] rounded-full animate-spin" />
                <p className="text-sm text-[#aaa] text-center max-w-xs">{statusMsg}</p>
                <p className="text-xs text-[#555]">
                  初回はモデルのダウンロードが必要です（約50MB）
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#111] border-t border-[#333] text-sm">
        {/* Mode toggle */}
        <span className="text-[#888]">モード:</span>
        {(["auto", "mouse"] as AnimMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setAnimMode(m)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              animMode === m
                ? "border-[#4a9eff] text-[#4a9eff] bg-[#4a9eff]/10"
                : "border-[#444] text-[#888] hover:border-[#666]"
            }`}
          >
            {m === "auto" ? "自動アニメーション" : "マウス追従"}
          </button>
        ))}

        {/* Strength */}
        <span className="text-[#888] ml-2">強度:</span>
        <input
          type="range"
          min={0.01}
          max={0.08}
          step={0.005}
          value={maxShift}
          onChange={(e) => setMaxShift(Number(e.target.value))}
          className="w-24 accent-[#4a9eff]"
        />
        <span className="text-[#666] text-xs w-8">{Math.round((maxShift / 0.08) * 100)}%</span>

        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1 rounded border border-[#444] text-[#aaa] hover:border-[#666] hover:text-white text-xs"
        >
          ✕ 閉じる
        </button>
      </div>
    </div>
  );
}
