import { useEffect, useState } from "react";
import { FileButton, Header, QueueBadge, useToast } from "../components";
import { go, useBlobUrl, useLive } from "../hooks";
import { deleteVehicle, getVehicle, listPhotos, putVehicle } from "../lib/db";
import { download, exportFiles, shareFiles, zipFor, baseName } from "../lib/export";
import { addBatch, addPhotos } from "../lib/photos";
import { enqueue } from "../lib/process";
import { SHOTS } from "../lib/shots";
import type { Photo, Vehicle } from "../lib/types";
import { barcodeSupported, decodeVin, normaliseVin, scanVin, vinCheck } from "../lib/vin";
import { vehicleTitle } from "./VehicleList";

function Thumb({ p, label }: { p: Photo; label: string }) {
  const url = useBlobUrl(p.thumb);
  return (
    <a className="shot has" href={`#/v/${p.vehicleId}/p/${p.id}`}>
      {url && <img src={url} alt={label} />}
      <span className="shot-label">{label}</span>
      {p.status !== "done" && <span className={`status ${p.status}`}>{p.status === "processing" ? "Working…" : p.status === "error" ? "Error" : "Queued"}</span>}
    </a>
  );
}

function Details({ v, toast }: { v: Vehicle; toast: (m: string) => void }) {
  const [f, setF] = useState(v);
  const [busy, setBusy] = useState(false);
  // Open for a fresh vehicle only, decided once so saving a field doesn't collapse it.
  const [startOpen] = useState(() => !v.make && !v.stockNo && !v.vin);
  useEffect(() => setF(v), [v.id]);
  const set = (k: keyof Vehicle) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = (next = f) => putVehicle({ ...next });
  const vinState = f.vin ? vinCheck(f.vin) : null;

  async function decode(vin = f.vin) {
    if (!vin) return;
    setBusy(true);
    try {
      const info = await decodeVin(vin);
      const next = { ...f, vin, year: f.year || info.year, make: f.make || info.make, model: f.model || info.model, variant: f.variant || info.variant };
      setF(next);
      await save(next);
      toast(info.make ? `Decoded: ${[info.year, info.make, info.model].filter(Boolean).join(" ")}` : "Decoder had nothing for that VIN. Enter details by hand.");
    } catch {
      toast("Couldn't reach the VIN decoder. Enter details by hand.");
    } finally {
      setBusy(false);
    }
  }

  async function scan(files: File[]) {
    const vin = await scanVin(files[0]);
    if (!vin) return toast("No VIN barcode found. Get closer and keep it sharp.");
    const next = { ...f, vin };
    setF(next);
    await save(next);
    void decode(vin);
  }

  return (
    <details className="card" open={startOpen}>
      <summary>Vehicle details</summary>
      <div className="grid2">
        <label>
          Stock no.
          <input value={f.stockNo} onChange={set("stockNo")} onBlur={() => save()} autoCapitalize="characters" />
        </label>
        <label>
          VIN
          <input
            value={f.vin}
            onChange={(e) => setF({ ...f, vin: normaliseVin(e.target.value) })}
            onBlur={() => save()}
            maxLength={17}
            autoCapitalize="characters"
            spellCheck={false}
          />
          {vinState === "bad-length" && <small className="warn">{f.vin.length}/17 characters</small>}
          {vinState === "check-digit" && <small className="muted">Check digit doesn't match. Normal for many non-US vehicles.</small>}
        </label>
      </div>
      <div className="row">
        {barcodeSupported() && (
          <FileButton capture onFiles={scan} className="btn small">
            Scan VIN barcode
          </FileButton>
        )}
        <button className="btn small" disabled={!f.vin || busy} onClick={() => decode()}>
          {busy ? "Decoding…" : "Decode VIN"}
        </button>
      </div>
      <div className="grid3">
        <label>
          Year
          <input value={f.year} onChange={set("year")} onBlur={() => save()} inputMode="numeric" />
        </label>
        <label>
          Make
          <input value={f.make} onChange={set("make")} onBlur={() => save()} />
        </label>
        <label>
          Model
          <input value={f.model} onChange={set("model")} onBlur={() => save()} />
        </label>
        <label>
          Variant
          <input value={f.variant} onChange={set("variant")} onBlur={() => save()} />
        </label>
        <label>
          Colour
          <input value={f.colour} onChange={set("colour")} onBlur={() => save()} />
        </label>
      </div>
    </details>
  );
}

function EmptySlot({ vehicleId, id, label, hint }: { vehicleId: string; id: string; label: string; hint: string }) {
  return (
    <div className="shot empty-slot">
      <strong>{label}</strong>
      <small className="muted">{hint}</small>
      <div className="row">
        <FileButton capture className="btn small primary" onFiles={(f) => addPhotos(vehicleId, id, f.slice(0, 1))}>
          Camera
        </FileButton>
        <FileButton className="btn small" onFiles={(f) => addPhotos(vehicleId, id, f.slice(0, 1))}>
          Gallery
        </FileButton>
      </div>
    </div>
  );
}

export default function VehicleDetail({ id }: { id: string }) {
  const data = useLive(async () => ({ v: await getVehicle(id), photos: await listPhotos(id) }), [id]);
  const [toastEl, toast] = useToast();
  const [busy, setBusy] = useState("");
  if (!data) return null;
  const { v, photos } = data;
  if (!v)
    return (
      <div className="page">
        <Header title="Not found" back="/" />
      </div>
    );

  const bySlot = new Map(photos.filter((p) => p.slot !== "extra").map((p) => [p.slot, p]));
  const extras = photos.filter((p) => p.slot === "extra" || !SHOTS.some((s) => s.id === p.slot));
  const ready = photos.filter((p) => p.output);
  const unprocessed = photos.filter((p) => p.status === "new" || p.status === "error");

  async function doZip() {
    setBusy("zip");
    try {
      download(await zipFor(v!, photos), `${baseName(v!)}.zip`);
    } finally {
      setBusy("");
    }
  }
  async function doShare() {
    const files = await exportFiles(v!, photos);
    if (!(await shareFiles(files, vehicleTitle(v!)))) toast("Sharing files isn't supported here. Use Download.");
  }
  async function doDelete() {
    if (!confirm(`Delete ${vehicleTitle(v!)} and all ${photos.length} photos from this device?`)) return;
    await deleteVehicle(v!.id);
    go("/");
  }

  return (
    <div className="page">
      <Header title={vehicleTitle(v)} back="/" right={<QueueBadge />} />
      <main>
        <Details v={v} toast={toast} />

        <div className="row wrap">
          <FileButton multiple className="btn" onFiles={(f) => addBatch(v.id, f)}>
            Add many photos
          </FileButton>
          {unprocessed.length > 0 && (
            <button className="btn" onClick={() => enqueue(unprocessed.map((p) => p.id))}>
              Process {unprocessed.length}
            </button>
          )}
          <button className="btn" disabled={!ready.length || !!busy} onClick={doZip}>
            {busy === "zip" ? "Zipping…" : `Download ${ready.length}`}
          </button>
          <button className="btn" disabled={!ready.length} onClick={doShare}>
            Share
          </button>
        </div>

        <h2>Shot list</h2>
        <div className="shots">
          {SHOTS.map((s) => {
            const p = bySlot.get(s.id);
            return p ? <Thumb key={s.id} p={p} label={s.label} /> : <EmptySlot key={s.id} vehicleId={v.id} id={s.id} label={s.label} hint={s.hint} />;
          })}
        </div>

        <h2>Extras</h2>
        <div className="shots">
          {extras.map((p) => (
            <Thumb key={p.id} p={p} label="Extra" />
          ))}
          <div className="shot empty-slot">
            <strong>Add extras</strong>
            <small className="muted">Damage, service book, features.</small>
            <div className="row">
              <FileButton capture className="btn small primary" onFiles={(f) => addPhotos(v.id, "extra", f)}>
                Camera
              </FileButton>
              <FileButton multiple className="btn small" onFiles={(f) => addPhotos(v.id, "extra", f)}>
                Gallery
              </FileButton>
            </div>
          </div>
        </div>

        <button className="btn danger" onClick={doDelete}>
          Delete vehicle
        </button>
      </main>
      {toastEl}
    </div>
  );
}
