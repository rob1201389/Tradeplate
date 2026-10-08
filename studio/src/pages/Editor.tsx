import { useEffect, useMemo, useRef, useState } from "react";
import { aiCleanGlass, glassKey } from "../lib/glass";
import { BackdropThumb, FileButton, Header, Segmented, Toggle, useToast } from "../components";
import { go, useBlobUrl, useLive } from "../hooks";
import { allBackdrops } from "../lib/backgrounds";
import { deletePhoto, getSettings, getVehicle, listPhotos, putPhoto } from "../lib/db";
import { download, fileNames } from "../lib/export";
import { moveToSlot, replaceOriginal } from "../lib/photos";
import { defaultQuad } from "../lib/plate";
import { enqueue, renderAndStore } from "../lib/process";
import { compose, outputSize, prepare, type Prepared } from "../lib/render";
import { LEVEL_SHOTS, SHOTS, shotDef, shotLabel } from "../lib/shots";
import type { EditSettings, PlateMode, Point } from "../lib/types";

const PREVIEW_EDGE = 1400;
const PREVIEW_W = 1200;

/** Drag the four corners onto the plate. Works with a finger or a mouse. */
function PlateEditor({ src, quad, onChange }: { src: Blob; quad: Point[]; onChange: (q: Point[]) => void }) {
  const url = useBlobUrl(src);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ idx: number; start: Point; orig: Point[] } | null>(null);

  const toNorm = (e: React.PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { idx, start: toNorm(e), orig: quad };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toNorm(e);
    if (d.idx < 0) {
      const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
      onChange(d.orig.map(([x, y]) => [x + dx, y + dy] as Point));
    } else onChange(d.orig.map((q, i) => (i === d.idx ? p : q)));
  };
  const up = () => (drag.current = null);

  return (
    <div className="plate-ed" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {url && <img src={url} alt="" draggable={false} />}
      <svg viewBox="0 0 1 1" preserveAspectRatio="none">
        <polygon points={quad.map((p) => p.join(",")).join(" ")} onPointerDown={down(-1)} />
      </svg>
      {quad.map(([x, y], i) => (
        <span key={i} className="handle" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onPointerDown={down(i)} />
      ))}
    </div>
  );
}

/**
 * Mark windows: tap each corner of a window, then "Finish window". Drag any
 * corner to adjust. Outlines are shared by Darken glass and AI clean-up.
 */
function GlassEditor({ src, polys, onChange, onDone }: { src: Blob; polys: Point[][]; onChange: (p: Point[][]) => void; onDone: () => void }) {
  const url = useBlobUrl(src);
  const box = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<Point[]>([]);
  const drag = useRef<{ poly: number; pt: number } | null>(null);
  const moved = useRef(false);

  const toNorm = (e: React.PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const startDrag = (poly: number, pt: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { poly, pt };
    moved.current = false;
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    moved.current = true;
    const p = toNorm(e);
    if (d.poly < 0) setCur(cur.map((q, i) => (i === d.pt ? p : q)));
    else onChange(polys.map((poly, i) => (i === d.poly ? poly.map((q, j) => (j === d.pt ? p : q)) : poly)));
  };
  const up = (e: React.PointerEvent) => {
    if (!drag.current && !moved.current && e.type === "pointerup") setCur([...cur, toNorm(e)]);
    drag.current = null;
    moved.current = false;
  };
  const finish = () => {
    if (cur.length >= 3) onChange([...polys, cur]);
    setCur([]);
  };
  const path = (poly: Point[]) => poly.map((p) => p.join(",")).join(" ");

  return (
    <>
      <div className="plate-ed glass-ed" ref={box} onPointerMove={move} onPointerUp={up}>
        {url && <img src={url} alt="" draggable={false} />}
        <svg viewBox="0 0 1 1" preserveAspectRatio="none">
          {polys.map((poly, i) => (
            <polygon key={i} points={path(poly)} />
          ))}
          {cur.length > 1 && <polyline points={path(cur)} />}
        </svg>
        {polys.map((poly, i) =>
          poly.map(([x, y], j) => <span key={`${i}-${j}`} className="handle small" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onPointerDown={startDrag(i, j)} />),
        )}
        {cur.map(([x, y], j) => (
          <span key={`c-${j}`} className="handle small cur" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onPointerDown={startDrag(-1, j)} />
        ))}
      </div>
      <p className="muted small">
        Tap each corner of a window, then Finish window. Do every window you can see, including the rear glass. Drag a corner to adjust.
      </p>
      <div className="row wrap">
        <button className="btn small primary" disabled={cur.length < 3} onClick={finish}>
          Finish window
        </button>
        <button className="btn small" disabled={!cur.length} onClick={() => setCur(cur.slice(0, -1))}>
          Undo corner
        </button>
        <button className="btn small" disabled={!polys.length} onClick={() => onChange(polys.slice(0, -1))}>
          Remove last window
        </button>
        <button className="btn small primary" onClick={() => { finish(); onDone(); }}>
          Done ({polys.length + (cur.length >= 3 ? 1 : 0)} window{polys.length + (cur.length >= 3 ? 1 : 0) === 1 ? "" : "s"})
        </button>
      </div>
    </>
  );
}

export default function Editor({ vehicleId, photoId }: { vehicleId: string; photoId: string }) {
  const data = useLive(async () => {
    const [v, photos, settings, backdrops] = await Promise.all([getVehicle(vehicleId), listPhotos(vehicleId), getSettings(), allBackdrops()]);
    return { v, photos, settings, backdrops, photo: photos.find((p) => p.id === photoId) };
  }, [vehicleId, photoId]);
  const [edit, setEdit] = useState<EditSettings>();
  const [prep, setPrep] = useState<Prepared>();
  const [plateMode, setPlateMode] = useState(false);
  const [glassMode, setGlassMode] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const [toastEl, toast] = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const photo = data?.photo;

  // Pick up the stored settings, and later changes from processing, unless the user has unsaved edits.
  const savedJson = photo ? JSON.stringify(photo.edit) : "";
  const dirty = !!edit && JSON.stringify(edit) !== savedJson;
  useEffect(() => {
    if (photo && !dirty) setEdit(photo.edit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson]);

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    prepare(photo.original, photo.mask, PREVIEW_EDGE, { fix: photo.glassFix, forKey: photo.glassFixFor }).then((p) => alive && setPrep(p));
    return () => {
      alive = false;
    };
  }, [photo?.original, photo?.mask, photo?.glassFix]);

  useEffect(() => {
    if (!prep || !edit || !data || plateMode || glassMode) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const { W, H } = outputSize(data.settings, PREVIEW_W);
        const out = await compose(prep, edit, data.settings, W, H);
        if (!alive || !canvas.current) return;
        canvas.current.width = W;
        canvas.current.height = H;
        canvas.current.getContext("2d")!.drawImage(out, 0, 0);
        setErr(undefined);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    }, 80);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [prep, edit, data?.settings, plateMode, glassMode]);

  const index = useMemo(() => data?.photos.findIndex((p) => p.id === photoId) ?? -1, [data, photoId]);
  if (!data || !photo || !edit) return null;
  const { settings, backdrops, photos, v } = data;
  const prev = photos[index - 1], next = photos[index + 1];
  const label = shotLabel(photo.slot);
  const upd = (patch: Partial<EditSettings>) => setEdit({ ...edit, ...patch });

  function setPlate(m: PlateMode) {
    if (m !== "none" && !edit!.plateQuad && prep) {
      upd({ plateMode: m, plateQuad: defaultQuad(prep.bbox, prep.src.width, prep.src.height) });
      setPlateMode(true);
    } else upd({ plateMode: m });
  }

  async function save() {
    setSaving(true);
    try {
      const p = { ...photo!, edit: edit! };
      if (edit!.removeBg && !p.mask) {
        await putPhoto(p);
        enqueue([p.id]);
        toast("Cutting out. This takes a few seconds.");
      } else {
        await renderAndStore(p);
        toast("Saved");
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this photo?")) return;
    await deletePhoto(photo!.id);
    go(`/v/${vehicleId}`);
  }

  const needsCut = edit.removeBg && !photo.mask;

  return (
    <div className="page editor">
      <Header
        title={label}
        back={`/v/${vehicleId}`}
        right={
          <>
            <button className="icon-btn" disabled={!prev} onClick={() => prev && go(`/v/${vehicleId}/p/${prev.id}`)} aria-label="Previous">
              ‹
            </button>
            <span className="muted">
              {index + 1}/{photos.length}
            </span>
            <button className="icon-btn" disabled={!next} onClick={() => next && go(`/v/${vehicleId}/p/${next.id}`)} aria-label="Next">
              ›
            </button>
          </>
        }
      />
      <main className="ed-main">
        <div className="stage">
          {glassMode ? (
            <GlassEditor src={photo.original} polys={edit.glass ?? []} onChange={(g) => upd({ glass: g })} onDone={() => setGlassMode(false)} />
          ) : plateMode && edit.plateQuad ? (
            <PlateEditor src={photo.original} quad={edit.plateQuad} onChange={(q) => upd({ plateQuad: q })} />
          ) : (
            <canvas ref={canvas} className="preview" />
          )}
          {photo.status === "processing" && <div className="stage-note">Cutting out…</div>}
          {photo.status === "error" && <div className="stage-note err">{photo.error}</div>}
          {err && !needsCut && <div className="stage-note err">{err}</div>}
        </div>

        <div className="controls">
          {glassMode ? (
            <p className="muted">Marking windows. Finish with Done under the photo.</p>
          ) : plateMode ? (
            <>
              <p className="muted">Drag the corners onto the plate's corners. Drag inside the box to move it.</p>
              <button className="btn primary block" onClick={() => setPlateMode(false)}>
                Done
              </button>
            </>
          ) : (
            <>
              <label>
                Shot
                <select value={SHOTS.some((x) => x.id === photo.slot) ? photo.slot : "extra"} onChange={(e) => moveToSlot(photo.id, e.target.value)}>
                  {SHOTS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                      {x.id !== photo.slot && photos.some((p) => p.slot === x.id) ? " (swap)" : ""}
                    </option>
                  ))}
                  <option value="extra">Extra</option>
                </select>
              </label>
              <Toggle label="Cut out and stage" checked={edit.removeBg} onChange={(b) => upd({ removeBg: b })} />
              {needsCut && <p className="muted">Save to cut this car out of its background.</p>}

              {edit.removeBg && (
                <>
                  <div className="bds">
                    {backdrops.map((bd) => (
                      <BackdropThumb key={bd.id} bd={bd} on={bd.id === edit.background} onPick={() => upd({ background: bd.id, reflection: bd.glossy })} />
                    ))}
                  </div>
                  <label className="slider">
                    Size
                    <input type="range" min={0.6} max={1.3} step={0.01} value={edit.scale} onChange={(e) => upd({ scale: +e.target.value })} />
                  </label>
                  <label className="slider">
                    Height
                    <input type="range" min={-0.15} max={0.12} step={0.005} value={-edit.offsetY} onChange={(e) => upd({ offsetY: -e.target.value })} />
                  </label>
                  <div className="row wrap">
                    <Toggle label="Shadow" checked={edit.shadow} onChange={(b) => upd({ shadow: b })} />
                    <Toggle label="Reflection" checked={edit.reflection} onChange={(b) => upd({ reflection: b })} />
                  </div>
                </>
              )}
              <div className="field">
                <span>Glare and glass</span>
                <label className="slider">
                  Reduce glare
                  <input type="range" min={0} max={1} step={0.05} value={edit.glare ?? 0} onChange={(e) => upd({ glare: +e.target.value })} />
                </label>
                <button className="btn small" onClick={() => setGlassMode(true)}>
                  {edit.glass?.length ? `Edit windows (${edit.glass.length})` : "Mark windows"}
                </button>
                {!!edit.glass?.length && (
                  <>
                    <label className="slider">
                      Darken glass
                      <input type="range" min={0} max={1} step={0.05} value={edit.glassTint ?? 0} onChange={(e) => upd({ glassTint: +e.target.value })} />
                    </label>
                    <div className="row wrap">
                      <button
                        className="btn small"
                        disabled={aiBusy}
                        onClick={async () => {
                          setAiBusy(true);
                          try {
                            const fix = await aiCleanGlass(photo.original, edit.glass!, settings);
                            const next = { ...photo, edit: { ...edit, glassAi: true }, glassFix: fix, glassFixFor: glassKey(edit.glass) };
                            await putPhoto(next);
                            setEdit(next.edit);
                            // Render now so the saved photo matches what's on screen.
                            await renderAndStore(next);
                            toast("Windows cleaned. Only the glass was changed; the paint is as shot.");
                          } catch (e) {
                            toast((e as Error).message);
                          } finally {
                            setAiBusy(false);
                          }
                        }}
                      >
                        {aiBusy ? "Cleaning glass…" : photo.glassFix && photo.glassFixFor === glassKey(edit.glass) ? "Redo AI glass" : "AI clean glass"}
                      </button>
                      {photo.glassFix && photo.glassFixFor === glassKey(edit.glass) && (
                        <Toggle label="Use AI glass" checked={!!edit.glassAi} onChange={(b) => upd({ glassAi: b })} />
                      )}
                    </div>
                    {photo.glassFix && photo.glassFixFor !== glassKey(edit.glass) && <small className="muted">Windows changed since the AI clean-up; run it again to use it.</small>}
                  </>
                )}
              </div>
              <div className="field">
                <span>Straighten</span>
                {edit.removeBg && (
                  <Toggle label={`Level the wheels${prep && edit.level && prep.levelAngle ? ` (${prep.levelAngle > 0 ? "+" : ""}${prep.levelAngle.toFixed(1)}°)` : ""}`} checked={!!edit.level} onChange={(b) => upd({ level: b })} />
                )}
                <label className="slider">
                  Tilt {(edit.rotate ?? 0).toFixed(1)}°
                  <input type="range" min={-10} max={10} step={0.1} value={edit.rotate ?? 0} onChange={(e) => upd({ rotate: +e.target.value })} />
                </label>
                {!!edit.rotate && (
                  <button className="btn small" onClick={() => upd({ rotate: 0 })}>
                    Reset tilt
                  </button>
                )}
                {edit.removeBg && !edit.level && LEVEL_SHOTS.has(photo.slot) && <small className="muted">Auto-level is off for this photo.</small>}
              </div>
              <div className="row wrap">
                <Toggle label="Enhance" checked={edit.enhance} onChange={(b) => upd({ enhance: b })} />
                <Toggle label="Logo" checked={edit.watermark} disabled={!settings.logo} onChange={(b) => upd({ watermark: b })} />
              </div>

              <div className="field">
                <span>Number plate</span>
                <Segmented<PlateMode>
                  value={edit.plateMode}
                  onChange={setPlate}
                  options={[
                    ["none", "Leave"],
                    ["cover", "Cover"],
                    ["blur", "Pixelate"],
                  ]}
                />
                {edit.plateMode !== "none" && (
                  <button className="btn small" onClick={() => setPlateMode(true)}>
                    Adjust plate box
                  </button>
                )}
              </div>

              <div className="row wrap">
                <button className="btn primary" disabled={saving || (!dirty && photo.status === "done")} onClick={save}>
                  {saving ? "Saving…" : needsCut ? "Save and cut out" : "Save"}
                </button>
                {dirty && (
                  <button className="btn" onClick={() => setEdit(photo.edit)}>
                    Undo changes
                  </button>
                )}
                {photo.output && (
                  <button className="btn" onClick={() => download(photo.output!, fileNames(v!, [photo])[0])}>
                    Download
                  </button>
                )}
              </div>
              <div className="row wrap">
                <FileButton capture className="btn small" onFiles={(f) => replaceOriginal(photo, f[0])}>
                  Retake
                </FileButton>
                {photo.mask && edit.removeBg && (
                  <button className="btn small" onClick={() => putPhoto({ ...photo, mask: undefined }).then(() => enqueue([photo.id]))}>
                    Redo cut-out
                  </button>
                )}
                <button className="btn small danger" onClick={remove}>
                  Delete
                </button>
              </div>
              {shotDef(photo.slot) && <p className="muted small">{shotDef(photo.slot)!.hint}</p>}
            </>
          )}
        </div>
      </main>
      {toastEl}
    </div>
  );
}
