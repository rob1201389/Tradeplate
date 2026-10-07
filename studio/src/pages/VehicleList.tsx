import { Header, QueueBadge } from "../components";
import { go, useBlobUrl, useLive } from "../hooks";
import { listPhotos, listVehicles, putVehicle, uid } from "../lib/db";
import type { Photo, Vehicle } from "../lib/types";

export function vehicleTitle(v: Vehicle) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ") || v.stockNo || "New vehicle";
}

function Card({ v }: { v: Vehicle & { photos: Photo[] } }) {
  const hero = v.photos.find((p) => p.thumb);
  const url = useBlobUrl(hero?.thumb);
  const done = v.photos.filter((p) => p.status === "done").length;
  return (
    <a className="vcard" href={`#/v/${v.id}`}>
      <div className="vthumb">{url ? <img src={url} alt="" /> : <span>No photos</span>}</div>
      <div className="vmeta">
        <strong>{vehicleTitle(v)}</strong>
        <span className="muted">
          {[v.stockNo && `Stock ${v.stockNo}`, v.vin].filter(Boolean).join(" · ") || "No stock number"}
        </span>
        <span className="muted">
          {done}/{v.photos.length} photos ready
        </span>
      </div>
    </a>
  );
}

export default function VehicleList() {
  const vehicles = useLive(async () => {
    const vs = await listVehicles();
    return Promise.all(vs.map(async (v) => ({ ...v, photos: await listPhotos(v.id) })));
  }, []);

  async function create() {
    const v: Vehicle = { id: uid(), stockNo: "", vin: "", year: "", make: "", model: "", variant: "", colour: "", createdAt: Date.now(), updatedAt: Date.now() };
    await putVehicle(v);
    go(`/v/${v.id}`);
  }

  return (
    <div className="page">
      <Header
        title="Car Studio"
        right={
          <>
            <QueueBadge />
            <a className="icon-btn" href="#/settings" aria-label="Settings">
              ⚙
            </a>
          </>
        }
      />
      <main>
        <button className="btn primary block" onClick={create}>
          + New vehicle
        </button>
        {vehicles?.length === 0 && (
          <div className="empty">
            <p>Add a vehicle, shoot the walk-around, and the app cuts each car out and stages it on a studio backdrop.</p>
            <p className="muted">Everything stays on this device until you export it.</p>
          </div>
        )}
        <div className="vlist">{vehicles?.map((v) => <Card key={v.id} v={v} />)}</div>
      </main>
    </div>
  );
}
