import { pipeline, env } from "@huggingface/transformers";

// Use remote models only (no local model lookup)
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let estimator: any = null;

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, imageDataUrl } = event.data;
  if (type !== "estimate") return;

  try {
    if (!estimator) {
      self.postMessage({ type: "status", message: "モデルを読み込み中..." });
      estimator = await pipeline(
        "depth-estimation",
        "Xenova/depth-anything-small-hf",
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progress_callback: (info: any) => {
            if (info.status === "downloading" || info.status === "progress") {
              self.postMessage({
                type: "progress",
                name: info.name ?? "",
                loaded: info.loaded ?? 0,
                total: info.total ?? 0,
              });
            }
          },
        }
      );
    }

    self.postMessage({ type: "status", message: "深度推定を実行中..." });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await estimator(imageDataUrl);

    const tensor = result.predicted_depth;
    // tensor.dims = [H, W]
    const rawData: Float32Array = await tensor.data;
    const h: number = tensor.dims[0];
    const w: number = tensor.dims[1];

    // Normalize to [0, 1]
    let min = Infinity;
    let max = -Infinity;
    for (const v of rawData) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const normalized = new Float32Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      normalized[i] = (rawData[i] - min) / range;
    }

    self.postMessage(
      { type: "result", depthMap: normalized, width: w, height: h },
      { transfer: [normalized.buffer] }
    );
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
});
