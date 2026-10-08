// Car Studio server: serves the app and runs the cut-out model on this machine,
// so phones on the same network (or anywhere, if you host it) don't have to.
//
//   npm run build && npm start         -> http://localhost:8787
//
// PORT, HOST, MODEL_DTYPE (fp32 | fp16 | q8), CORS_ORIGIN, MAX_UPLOAD_MB, API_KEY
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const DTYPE = process.env.MODEL_DTYPE || "fp32";
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const API_KEY = process.env.API_KEY || "";
const CORS = process.env.CORS_ORIGIN || "*";
const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

env.cacheDir = process.env.MODEL_CACHE || path.join(root, ".model-cache");

let modelP;
function loadModel() {
  modelP ??= (async () => {
    const t = Date.now();
    const model = await AutoModel.from_pretrained(MODEL_ID, { dtype: DTYPE });
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {});
    console.log(`model ready in ${((Date.now() - t) / 1000).toFixed(1)}s (${DTYPE})`);
    return { model, processor };
  })();
  modelP.catch((e) => {
    console.error("model load failed:", e.message);
    modelP = undefined;
  });
  return modelP;
}

// One inference at a time keeps memory flat; requests queue behind each other.
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

const app = express();
app.disable("x-powered-by");

app.use("/api", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", CORS);
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Photoai-Key");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // Lets an https page or the Android app reach this server on a private address.
  res.set("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (API_KEY && req.path !== "/health" && req.path !== "/glass" && req.get("Authorization") !== `Bearer ${API_KEY}`) return res.status(401).send("Missing or wrong API key");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, model: MODEL_ID, auth: !!API_KEY }));

app.post("/api/mask", express.raw({ type: "image/*", limit: `${MAX_MB}mb` }), async (req, res) => {
  if (!req.body?.length) return res.status(400).send("Send the photo as the request body with an image/* content type");
  try {
    const png = await serial(async () => {
      const { model, processor } = await loadModel();
      // Normalise orientation and format before the model sees it.
      const { data, info } = await sharp(req.body).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const image = new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
      const { pixel_values } = await processor(image);
      const { output_image } = await model({ input_image: pixel_values });
      const mask = await RawImage.fromTensor(output_image[0].sigmoid().mul(255).to("uint8")).resize(image.width, image.height);
      return sharp(Buffer.from(mask.data), { raw: { width: mask.width, height: mask.height, channels: 1 } }).png().toBuffer();
    });
    res.type("image/png").send(png);
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message || "Processing failed");
  }
});

// AI glass clean-up: repaints only the masked windows via Stability AI's
// inpaint service. The provider key stays on this server.
//   STABILITY_API_KEY  the provider key (required for this route)
//   PHOTOAI_KEY        access key phones must send (recommended if exposed)
export const GLASS_PROMPT =
  "clean dark tinted automotive window glass, smooth even soft reflection of a bright photo studio, no scenery, photorealistic, sharp";
export const GLASS_NEGATIVE = "trees, sky, clouds, buildings, people, person, text, logo, watermark, distorted, blurry, extra objects";

app.post("/api/glass", express.raw({ type: "multipart/form-data", limit: `${MAX_MB}mb` }), async (req, res) => {
  res.set("Access-Control-Allow-Origin", CORS);
  if (!process.env.STABILITY_API_KEY) return res.status(503).send("AI glass is not configured (STABILITY_API_KEY).");
  if (process.env.PHOTOAI_KEY && req.get("X-Photoai-Key") !== process.env.PHOTOAI_KEY) return res.status(401).send("Wrong access key");
  try {
    // Let undici parse the multipart body.
    const form = await new Response(req.body, { headers: { "content-type": req.get("content-type") } }).formData();
    const image = form.get("image"), mask = form.get("mask");
    if (!(image instanceof Blob) || !(mask instanceof Blob)) return res.status(400).send("Send image and mask");
    const out = new FormData();
    out.append("image", image, "image.jpg");
    out.append("mask", mask, "mask.png");
    out.append("prompt", GLASS_PROMPT);
    out.append("negative_prompt", GLASS_NEGATIVE);
    out.append("grow_mask", "4");
    out.append("output_format", "jpeg");
    const r = await fetch(process.env.STABILITY_URL || "https://api.stability.ai/v2beta/stable-image/edit/inpaint", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STABILITY_API_KEY}`, Accept: "image/*" },
      body: out,
    });
    if (!r.ok) return res.status(502).send(`Provider ${r.status}: ${(await r.text()).slice(0, 300)}`);
    res.type(r.headers.get("content-type") || "image/jpeg").send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message || "AI glass failed");
  }
});

const dist = path.join(root, "dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: "index.html", maxAge: "1h" }));
} else {
  app.get("/", (_req, res) => res.send("API only. Run <code>npm run build</code> to serve the app from here too."));
}

app.listen(PORT, HOST, () => {
  console.log(`Car Studio on http://localhost:${PORT}`);
  void loadModel();
});
