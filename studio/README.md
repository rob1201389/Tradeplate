# Car Studio

Shoot a vehicle on a phone, and the app cuts the car out of the yard, stages it
on a studio backdrop with a floor shadow, covers the number plate, tones the
image and exports a numbered set ready for a listing. Interior and detail shots
get the tone fix only.

Runs three ways from one codebase:

| Mode | What runs where | Use it when |
| --- | --- | --- |
| **On the phone** | Whole app and AI model in the browser or Android app. Nothing leaves the device. | One person shooting, phone from the last few years |
| **Local server** | `npm start` on a PC in the office. Phones on the same Wi-Fi open it in the browser, or point the Android app at it. | Older phones, or a few people shooting. PC does the heavy lifting |
| **Online** | Static build on any web host, plus optionally the server on a VPS or Docker host | Access from anywhere |

Photos, settings and backdrops are stored on the device (IndexedDB). There are
no accounts and no cloud database. Export gets the files out.

## What it does

- **Vehicle records**: stock number, VIN, rego, year, make, model, variant,
  colour. VIN can be read from the barcode on the door-jamb sticker (Android
  Chrome). The VIN decoder gives make and country of build offline for any
  car, the year where the VIN reliably holds it (not Japanese, Thai or
  Australian-built cars), and model only where the free US database knows the
  car, which misses most Australian-delivered stock. For models, import the
  stock list instead.
- **Stock import**: CSV or Excel export from the DMS, mapped by column heading
  (handles Toyota-style "Vehicle Description" / "Colour Description" / "V.I.N."
  layouts, strips model and suffix codes, ignores interior trim). Or a
  screenshot of a stock list: read on the phone, columns placed by the heading
  row, VIN misreads repaired with the check digit where only one fix fits,
  anything doubtful outlined in red. Rows are shown for checking before saving;
  existing vehicles are matched on VIN or stock number and updated.
- **Shot list**: 21 standard angles in listing order (front 3/4 first, since
  classifieds use photo one as the hero) with a framing hint for each, plus
  unlimited extras. "Add many photos" drops a camera-roll batch into the empty
  slots in order. Any photo can be moved to another shot from the editor
  (swaps if the shot is taken). Close-ups put in an exterior slot (a mirror, a
  wheel) are detected and left as shot rather than staged.
- **Showroom per vehicle**: backdrop and logo chosen once on the vehicle screen
  apply to every photo; each photo can still be changed in the editor.
- **Straighten**: side, front and rear shots are levelled automatically from
  the tyres; a tilt slider covers the rest.
- **Cut-out and staging**: BiRefNet lite segmentation, stray-blob cleanup,
  auto fit, contact and ambient shadow, optional floor reflection.
- **Backdrops**: six built in (drawn in code, so no image licences), plus your
  own: shoot the showroom empty, upload it, set the tyre line.
- **Number plate**: drag four corners onto the plate, then cover it with a
  panel warped into the right perspective (your text and colours, or your own
  artwork) or pixelate it. Placement is manual for now.
- **Enhance**: luminance levels and gamma from the car's own pixels, slight
  saturation lift. One curve for all channels so paint colour doesn't shift.
- **Logo**: load it from the vehicle screen or Settings; top-right by default
  (any corner), on every photo once loaded. Output size, aspect (4:3, 3:2, 16:9, 1:1), JPEG quality.
- **Export**: ZIP download named `<stock>_<nn>_<angle>.jpg`, or the phone's
  share sheet.

## Run it

```bash
cd studio
npm install
npm run dev          # development, http://localhost:5173
```

### Local server (recommended for a yard)

```bash
npm run build
npm start            # http://localhost:8787, and http://<pc-ip>:8787 from phones
```

First start downloads the model (about 230 MB) into `.model-cache/`; after that
it works offline. Expect 5–25 s per photo on a normal office PC, one at a time.

Settings on the server (environment variables):

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 8787 | |
| `HOST` | 0.0.0.0 | `127.0.0.1` to keep it off the network |
| `API_KEY` | none | Set this if the server is reachable from the internet. Enter the same key in the app's Settings |
| `CORS_ORIGIN` | `*` | Lock to your hosted app's origin if you host both |
| `MODEL_DTYPE` | fp32 | `fp16` uses less memory, slower on most CPUs |
| `MAX_UPLOAD_MB` | 25 | |

Docker:

```bash
docker build -t car-studio studio
docker run -p 8787:8787 -v car-studio-data:/data -e API_KEY=change-me car-studio
```

**Phone over plain http on the LAN**: the app works, but the browser won't
offer "Install app" and won't cache it offline, because both need https. The
Android app below doesn't have that limit. For the browser, put the server
behind https (Caddy, Cloudflare Tunnel, Tailscale) if you want it installable.

### Online

`npm run build` produces `dist/`, a static site that works from any host and
any sub-folder. Vercel, Netlify, GitHub Pages and S3 all work. **Cloudflare
Pages won't**: it caps files at 25 MB and the AI runtime file is 26 MB.

On a hosted page with no server configured, processing happens on the phone.
To use a server instead, run it somewhere with `API_KEY` set and enter its
address and key in Settings.

### Android app

Two options.

1. **Install from the browser** (no build). Open the hosted https address in
   Chrome, menu, *Install app*. Gets a home-screen icon, full screen, works
   offline once the model is downloaded.
2. **APK.** The GitHub Action `Car Studio Android APK` builds a debug APK on
   every push to `studio/` (or run it by hand from the Actions tab). Download
   the artifact and sideload it. For the Play Store you need a signed release
   build: `npm run android:sync`, open `android/` in Android Studio, *Build >
   Generate Signed Bundle*.

Building locally needs Android Studio / JDK 21:

```bash
npm run build && npx cap add android && npx cap sync android
cd android && ./gradlew assembleDebug
```

## On-device performance

The phone runs a 512 px version of the model (about 100 MB, downloaded once,
then cached). The 1024 px model the server uses ran out of memory in the browser in testing.
The 512 px mask has slightly softer edges; on a 1920 px output it's hard to
pick. Phones with WebGPU (Chrome 121+ on Android 12+ with a supported GPU) should
take a few seconds per photo; not yet measured on a real handset. Without it
the CPU path runs: 17 s per photo on a desktop CPU in testing, so expect
longer on a mid-range phone. If that's too slow, use the server.

## Licences of what ships

| Component | Licence |
| --- | --- |
| BiRefNet lite weights, server (`onnx-community/BiRefNet_lite-ONNX`) | MIT |
| BiRefNet lite 512 re-export, on device (`studioludens/birefnet-lite-512`, pinned commit) | MIT |
| Transformers.js | Apache 2.0 |
| ONNX Runtime | MIT |
| React, idb, fflate, Express, sharp, Capacitor | MIT / ISC / Apache 2.0 |

Deliberately not used: remove.bg-style background-removal libraries under
AGPL, and RMBG / RMBG-2.0 weights (non-commercial licences). Swapping either
in would put the app under those terms.

The VIN decoder is a US government API (public). Built-in backdrops are drawn
in code. No third-party images are bundled.

## Known gaps

- Plate placement is manual. Automatic plate detection is the obvious next step.
- No sync between devices. Each phone keeps its own vehicles until exported.
- No direct push to a DMS, website or classifieds feed. Export is ZIP or share.
- Glass: the model treats windows as part of the car (correct), so the yard
  behind is still visible through the side glass on some angles.
- Cars on a trailer, under a cover or with people touching them can confuse
  the cut-out. Use *Redo cut-out* or turn staging off for that shot.

## Layout

```
src/lib/segment*.ts   model loading, server/device switch, mask cleanup
src/lib/render.ts     compositing: fit, shadow, reflection, enhance, logo
src/lib/plate.ts      perspective plate cover and pixelation
src/lib/backgrounds.ts built-in backdrops and custom ones
src/lib/process.ts    background job queue
src/pages/            vehicle list, vehicle, editor, settings
server/index.mjs      Express server: static app + POST /api/mask
```
