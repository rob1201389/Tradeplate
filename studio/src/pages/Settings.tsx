import { useEffect, useState } from "react";
import { FileButton, Header, Segmented, Toggle, useToast } from "../components";
import { useBlobUrl, useLive } from "../hooks";
import { BUILTIN, clearBackdropCache } from "../lib/backgrounds";
import { deleteBackground, getSettings, listBackgrounds, putBackground, saveSettings, uid, wipeAll } from "../lib/db";
import { onModelProgress, preloadDeviceModel, resolveEngine, serverBase, serverReachable } from "../lib/segment";
import type { Aspect, CustomBackground, Engine, PlateMode, Settings } from "../lib/types";

function CustomBg({ b }: { b: CustomBackground }) {
  const url = useBlobUrl(b.image);
  const [ground, setGround] = useState(b.floorLine);
  return (
    <div className="custom-bg">
      <div className="cbg-img">
        {url && <img src={url} alt="" />}
        <div className="ground-line" style={{ top: `${ground * 100}%` }} />
      </div>
      <strong>{b.name}</strong>
      <label className="slider">
        Tyre line
        <input
          type="range" min={0.5} max={0.98} step={0.005} value={ground}
          onChange={(e) => setGround(+e.target.value)}
          onPointerUp={() => { clearBackdropCache(); putBackground({ ...b, floorLine: ground }); }}
          onKeyUp={() => { clearBackdropCache(); putBackground({ ...b, floorLine: ground }); }}
        />
      </label>
      <div className="row">
        <Toggle label="Shiny floor" checked={b.glossy} onChange={(g) => putBackground({ ...b, glossy: g })} />
        <button className="btn small danger" onClick={() => confirm(`Remove ${b.name}?`) && deleteBackground(b.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const loaded = useLive(getSettings, []);
  const customs = useLive(listBackgrounds, []);
  const [s, setS] = useState<Settings>();
  const [engineInfo, setEngineInfo] = useState("");
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState("");
  const [toastEl, toast] = useToast();
  const logoUrl = useBlobUrl(s?.logo);
  const plateUrl = useBlobUrl(s?.plateImage);

  useEffect(() => {
    if (loaded && !s) setS(loaded);
  }, [loaded, s]);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1e6).toFixed(0)} MB used on this device`));
  }, [customs]);

  useEffect(() => {
    if (!s) return;
    resolveEngine(s).then(
      (e) => setEngineInfo(e.kind === "server" ? `Using server ${e.base === "." ? "(this one)" : e.base}` : "Using this device"),
      (e) => setEngineInfo((e as Error).message),
    );
  }, [s?.engine, s?.serverUrl]);

  if (!s) return null;
  const upd = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void saveSettings(next);
  };

  async function testServer() {
    const base = serverBase(s!);
    toast((await serverReachable(base || ".")) ? "Server reachable" : "Can't reach that server");
  }

  async function loadModel() {
    setModel("Starting…");
    const off = onModelProgress((l, t) => setModel(`Downloading ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB`));
    try {
      const dev = await preloadDeviceModel();
      setModel(`Ready (${dev === "webgpu" ? "GPU" : "CPU"})`);
    } catch (e) {
      setModel(`Failed: ${(e as Error).message}`);
    } finally {
      off();
    }
  }

  async function addBg(files: File[]) {
    for (const f of files) await putBackground({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), image: f, floorLine: 0.82, glossy: false });
  }

  return (
    <div className="page">
      <Header title="Settings" back="/" />
      <main>
        <section className="card">
          <h2>Processing</h2>
          <Segmented<Engine>
            value={s.engine}
            onChange={(engine) => upd({ engine })}
            options={[
              ["auto", "Auto"],
              ["device", "This device"],
              ["server", "Server"],
            ]}
          />
          <p className="muted small">
            This device: the cut-out model (about 100 MB, downloaded once) runs on the phone. Fast on recent phones with GPU support, slow on older ones.
            Server: photos go to a computer running the Car Studio server, on your network or online. Auto uses a server when one answers.
          </p>
          <label>
            Server address
            <input placeholder="http://192.168.1.20:8787" value={s.serverUrl} onChange={(e) => upd({ serverUrl: e.target.value })} inputMode="url" />
          </label>
          <label>
            Server key (only if the server sets API_KEY)
            <input type="password" value={s.serverKey} onChange={(e) => upd({ serverKey: e.target.value })} autoComplete="off" />
          </label>
          <div className="row wrap">
            <button className="btn small" onClick={testServer}>
              Test server
            </button>
            <button className="btn small" onClick={loadModel}>
              Download model to device
            </button>
          </div>
          <p className="muted small">
            {engineInfo}
            {model && ` · Model: ${model}`}
          </p>
        </section>

        <section className="card">
          <h2>AI glass clean-up</h2>
          <p className="muted small">
            Repaints only the windows you mark, through a paid image service (about US$0.03-0.04 a photo). The service key lives on the server; the
            access key below just lets this phone use it. Paint is never sent back changed: only pixels inside the window outlines are used, and the
            original photo is always kept.
          </p>
          <label>
            Access key
            <input type="password" value={s.aiKey} onChange={(e) => upd({ aiKey: e.target.value })} autoComplete="off" />
          </label>
          <label>
            Service address (leave blank on the website)
            <input placeholder="https://rsmotocons.com/photoai" value={s.aiUrl} onChange={(e) => upd({ aiUrl: e.target.value })} inputMode="url" />
          </label>
        </section>

        <section className="card">
          <h2>Output</h2>
          <div className="field">
            <span>Shape</span>
            <Segmented<Aspect>
              value={s.aspect}
              onChange={(aspect) => upd({ aspect })}
              options={[
                ["4:3", "4:3"],
                ["3:2", "3:2"],
                ["16:9", "16:9"],
                ["1:1", "1:1"],
              ]}
            />
          </div>
          <div className="grid2">
            <label>
              Width (px)
              <select value={s.outputWidth} onChange={(e) => upd({ outputWidth: +e.target.value })}>
                {[1280, 1600, 1920, 2400, 3000].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label>
              JPEG quality
              <select value={s.jpegQuality} onChange={(e) => upd({ jpegQuality: +e.target.value })}>
                {[0.75, 0.82, 0.88, 0.94].map((q) => (
                  <option key={q} value={q}>
                    {Math.round(q * 100)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Default backdrop
            <select value={s.defaultBackground} onChange={(e) => upd({ defaultBackground: e.target.value })}>
              {[...BUILTIN, ...(customs ?? []).map((c) => ({ id: c.id, name: c.name }))].map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">Changes apply to photos you save or process from now on.</p>
        </section>

        <section className="card">
          <h2>Your backdrops</h2>
          <p className="muted small">Shoot your own showroom or wall empty, upload it, then set the line where tyres should sit.</p>
          {customs?.map((b) => <CustomBg key={b.id} b={b} />)}
          <FileButton multiple className="btn small" onFiles={addBg}>
            Upload backdrop
          </FileButton>
        </section>

        <section className="card">
          <h2>Number plate cover</h2>
          <div className="field">
            <span>Default for front and rear shots</span>
            <Segmented<PlateMode>
              value={s.defaultPlateMode}
              onChange={(defaultPlateMode) => upd({ defaultPlateMode })}
              options={[
                ["none", "Leave"],
                ["cover", "Cover"],
                ["blur", "Pixelate"],
              ]}
            />
          </div>
          <label>
            Text on cover
            <input value={s.plateText} onChange={(e) => upd({ plateText: e.target.value })} maxLength={24} />
          </label>
          <div className="grid2">
            <label>
              Background
              <input type="color" value={s.plateBg} onChange={(e) => upd({ plateBg: e.target.value })} />
            </label>
            <label>
              Text
              <input type="color" value={s.plateFg} onChange={(e) => upd({ plateFg: e.target.value })} />
            </label>
          </div>
          <div className="row wrap">
            {plateUrl && <img className="logo-prev" src={plateUrl} alt="" />}
            <FileButton className="btn small" onFiles={(f) => upd({ plateImage: f[0] })}>
              {s.plateImage ? "Replace plate artwork" : "Use plate artwork"}
            </FileButton>
            {s.plateImage && (
              <button className="btn small" onClick={() => upd({ plateImage: undefined })}>
                Remove
              </button>
            )}
          </div>
          <p className="muted small">Placing the box is manual for now: tap "Cover" in the editor and drag the corners.</p>
        </section>

        <section className="card">
          <h2>Logo</h2>
          <div className="row wrap">
            {logoUrl && <img className="logo-prev" src={logoUrl} alt="" />}
            <FileButton className="btn small" onFiles={(f) => upd({ logo: f[0] })}>
              {s.logo ? "Replace logo" : "Upload logo (PNG)"}
            </FileButton>
            {s.logo && (
              <button className="btn small" onClick={() => upd({ logo: undefined, watermarkDefault: false })}>
                Remove
              </button>
            )}
          </div>
          <Toggle label="Add logo to new photos" checked={s.watermarkDefault} disabled={!s.logo} onChange={(watermarkDefault) => upd({ watermarkDefault })} />
          <label className="slider">
            Logo size
            <input type="range" min={0.06} max={0.3} step={0.01} value={s.watermarkSize} onChange={(e) => upd({ watermarkSize: +e.target.value })} />
          </label>
        </section>

        <section className="card">
          <h2>Storage</h2>
          <p className="muted small">{usage || "Photos are stored on this device only."} Export what you need, then delete vehicles to free space.</p>
          <button
            className="btn small danger"
            onClick={async () => {
              if (confirm("Delete every vehicle, photo, backdrop and setting on this device?")) {
                await wipeAll();
                location.hash = "/";
              }
            }}
          >
            Delete everything
          </button>
        </section>
      </main>
      {toastEl}
    </div>
  );
}
