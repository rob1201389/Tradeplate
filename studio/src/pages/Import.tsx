import { useState } from "react";
import { FileButton, Header, useToast } from "../components";
import { go } from "../hooks";
import { applyImport, FIELDS, planImport, readScreenshot, readSpreadsheet, type Field, type ImportPlan } from "../lib/importer";
import { vehicleTitle } from "./VehicleList";
import { vinCheck } from "../lib/vin";

export default function Import() {
  const [plans, setPlans] = useState<ImportPlan[]>([]);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [toastEl, toast] = useToast();

  async function load(fn: () => Promise<{ rows: ImportPlan["row"][]; note: string }>) {
    setPlans([]);
    try {
      const { rows, note } = await fn();
      const p = await planImport(rows);
      setPlans(p);
      setKeep(p.map(() => true));
      setNote(rows.length ? note : "No vehicles found. Check the file has a heading row (Stock, VIN, Make, Model...).");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const fromSheet = (files: File[]) => {
    setBusy("Reading spreadsheet…");
    return load(async () => {
      const { rows, mapped } = await readSpreadsheet(files[0]);
      const names = FIELDS.filter(([f]) => mapped.includes(f)).map(([, l]) => l);
      return { rows, note: names.length ? `Matched columns: ${names.join(", ")}.` : "No standard column names found; read the description column only." };
    });
  };

  const fromShot = (files: File[]) => {
    setBusy("Reading screenshot…");
    return load(async () => {
      const rows = (await Promise.all(files.map((f) => readScreenshot(f, (p, stage) => setBusy(`${stage.includes("recogn") ? "Reading text" : "Loading text reader"}… ${Math.round(p * 100)}%`))))).flat();
      return { rows, note: "Read from a screenshot: check every row. VINs outlined in red fail the check digit, so a character is probably misread." };
    });
  };

  const edit = (i: number, f: Field, v: string) => setPlans(plans.map((p, j) => (j === i ? { ...p, row: { ...p.row, [f]: v } } : p)));
  const chosen = plans.filter((_, i) => keep[i]);

  async function doImport() {
    setBusy("Importing…");
    const { added, updated } = await applyImport(chosen);
    setBusy("");
    toast(`${added} added, ${updated} updated`);
    setTimeout(() => go("/"), 900);
  }

  return (
    <div className="page">
      <Header title="Import stock" back="/" />
      <main>
        <section className="card">
          <h2>From a spreadsheet</h2>
          <p className="muted small">
            Export the stock list from your DMS or stock book as CSV or Excel (.xlsx). Columns are matched by heading: stock no., VIN, rego, year, make,
            model, variant, colour. A single "Vehicle" or "Description" column like "2021 Toyota Yaris Cross GX" is split up too.
          </p>
          <FileButton className="btn primary" accept=".csv,.xlsx,.xls,.txt,text/csv" onFiles={fromSheet}>
            Choose spreadsheet
          </FileButton>
        </section>

        <section className="card">
          <h2>From a screenshot</h2>
          <p className="muted small">
            A screenshot of a stock list. Text is read on this phone (the reader downloads about 10 MB the first time). Picks up VINs, year, make and
            model; best with a sharp, zoomed-in shot. Spreadsheets are more reliable.
          </p>
          <FileButton className="btn" accept="image/*" multiple onFiles={fromShot}>
            Choose screenshots
          </FileButton>
        </section>

        {busy && <p className="pill busy">{busy}</p>}
        {note && <p className="muted small">{note}</p>}

        {plans.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="imp">
                <thead>
                  <tr>
                    <th />
                    {FIELDS.map(([f, l]) => (
                      <th key={f}>{l}</th>
                    ))}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p, i) => (
                    <tr key={i} className={keep[i] ? "" : "off"}>
                      <td>
                        <input type="checkbox" checked={keep[i]} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} aria-label="Include" />
                      </td>
                      {FIELDS.map(([f]) => (
                        <td key={f}>
                          <input
                            value={p.row[f] ?? ""}
                            onChange={(e) => edit(i, f, e.target.value)}
                            className={f === "vin" ? `vin${p.row.vin && vinCheck(p.row.vin) !== "ok" ? " bad" : ""}` : ""}
                            title={f === "vin" && p.row.vin && vinCheck(p.row.vin) !== "ok" ? "Check this VIN: it fails the check digit, so a character is probably misread" : undefined}
                          />
                        </td>
                      ))}
                      <td className="small">{p.existing ? <span className="pill">Updates {vehicleTitle(p.existing)}</span> : <span className="pill new">New</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn primary block" disabled={!chosen.length || !!busy} onClick={doImport}>
              Import {chosen.length} vehicle{chosen.length === 1 ? "" : "s"}
            </button>
          </>
        )}
      </main>
      {toastEl}
    </div>
  );
}
