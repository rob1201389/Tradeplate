/// <reference lib="webworker" />
// Runs the cut-out model off the main thread.
//
// On device this uses a 512 px re-export of BiRefNet lite (MIT). The 1024 px
// original that the server uses runs out of memory in every browser backend.
// Pinned to a commit so a change upstream can't change what runs on phones.
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";

export const MODEL_ID = "studioludens/birefnet-lite-512";
const REVISION = "4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7";

env.allowLocalModels = false;

type Model = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

let loading: Promise<{ model: Model; processor: Processor; device: string }> | null = null;

async function pickDevice(): Promise<"webgpu" | "wasm"> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return "wasm";
  try {
    return (await gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

function load() {
  loading ??= (async () => {
    const device = await pickDevice();
    const progress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.total) self.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
    };
    let model: Model;
    try {
      // fp16 halves the download (≈98 MB).
      model = await AutoModel.from_pretrained(MODEL_ID, { revision: REVISION, dtype: "fp16", device, progress_callback: progress });
    } catch (e) {
      if (device === "wasm") throw e;
      console.warn("WebGPU load failed, using CPU", e);
      model = await AutoModel.from_pretrained(MODEL_ID, { revision: REVISION, dtype: "fp16", device: "wasm", progress_callback: progress });
    }
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: REVISION });
    return { model, processor, device };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

self.onmessage = async (e: MessageEvent<{ id: number; type: "load" | "mask"; image?: Blob }>) => {
  const { id, type } = e.data;
  try {
    const { model, processor, device } = await load();
    if (type === "load") {
      self.postMessage({ id, ok: true, device });
      return;
    }
    const image = await RawImage.fromBlob(e.data.image!);
    const { pixel_values } = await processor(image);
    const { output_image } = await model({ input_image: pixel_values });
    const mask = await RawImage.fromTensor(output_image[0].sigmoid().mul(255).to("uint8")).resize(image.width, image.height);
    const data = new Uint8Array(mask.data as Uint8Array);
    self.postMessage({ id, ok: true, device, width: mask.width, height: mask.height, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
