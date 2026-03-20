import { readFile } from "@tauri-apps/plugin-fs";

export interface DepthResult {
  depthMap: Float32Array;
  width: number;
  height: number;
}

// path → result cache
const cache = new Map<string, DepthResult>();
// path → in-progress promise (for deduplication)
const pending = new Map<string, Promise<DepthResult | null>>();

export function getCachedDepth(path: string): DepthResult | null {
  return cache.get(path) ?? null;
}

export function setCachedDepth(path: string, result: DepthResult): void {
  cache.set(path, result);
}

/**
 * Compute depth for an image (loads file, runs worker, caches result).
 * Concurrent calls for the same path share one computation.
 * Pass signal to stop waiting (computation continues and caches in background).
 */
export function computeDepth(imagePath: string, signal?: AbortSignal): Promise<DepthResult | null> {
  if (cache.has(imagePath)) return Promise.resolve(cache.get(imagePath)!);

  // Deduplicate concurrent requests
  let promise = pending.get(imagePath);
  if (!promise) {
    promise = doCompute(imagePath).finally(() => {
      if (pending.get(imagePath) === promise) pending.delete(imagePath);
    });
    pending.set(imagePath, promise);
  }

  if (!signal) return promise;

  // Allow caller to abort without cancelling the shared computation
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      if (signal.aborted) { resolve(null); return; }
      signal.addEventListener("abort", () => resolve(null), { once: true });
    }),
  ]);
}

async function doCompute(imagePath: string): Promise<DepthResult | null> {
  let blobUrl = "";
  try {
    const bytes = await readFile(imagePath);
    const ext = imagePath.split(".").pop()?.toLowerCase() ?? "";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("load failed"));
      img.src = blobUrl;
    });

    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const oc = document.createElement("canvas");
    oc.width = Math.round(img.naturalWidth * scale);
    oc.height = Math.round(img.naturalHeight * scale);
    oc.getContext("2d")!.drawImage(img, 0, 0, oc.width, oc.height);
    const dataUrl = oc.toDataURL("image/jpeg", 0.9);

    const result = await runWorker(dataUrl);
    if (result) setCachedDepth(imagePath, result);
    return result;
  } catch {
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

function runWorker(dataUrl: string): Promise<DepthResult | null> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("../workers/depth.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e) => {
      const { type, depthMap, width, height } = e.data;
      if (type === "result") {
        worker.terminate();
        const result: DepthResult = { depthMap: depthMap as Float32Array, width, height };
        resolve(result);
      } else if (type === "error") {
        worker.terminate();
        resolve(null);
      }
    };
    worker.onerror = () => { worker.terminate(); resolve(null); };
    worker.postMessage({ type: "estimate", imageDataUrl: dataUrl });
  });
}
