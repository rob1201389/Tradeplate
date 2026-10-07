// Builds the drop-in for the Cloudflare Pages site: copies dist/ to
// ../cloudflare/photoai/ without the 27 MB AI runtime, which is over the
// Pages 25 MiB per-file limit. Transformers.js fetches that runtime from the
// jsDelivr CDN instead (its default), so the local copy is never used.
import { cpSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const dist = "dist";
const out = "../cloudflare/photoai";
const LIMIT = 25 * 1024 * 1024;

for (const f of readdirSync(path.join(dist, "assets"))) {
  if (f.endsWith(".wasm")) rmSync(path.join(dist, "assets", f));
}
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const big = walk(dist).filter((f) => statSync(f).size > LIMIT);
if (big.length) throw new Error(`Over the Pages file limit: ${big.join(", ")}`);

rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });
console.log(`copied ${walk(out).length} files to ${out}`);
