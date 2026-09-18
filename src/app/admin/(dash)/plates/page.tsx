import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { setPlateActive } from "@/app/actions";
import { plateUrl } from "@/lib/qr";
import AddPlateForm from "./AddPlateForm";

export const dynamic = "force-dynamic";

export default async function PlatesPage() {
  const db = getDb();
  const plates = await db
    .select()
    .from(schema.plates)
    .orderBy(asc(schema.plates.plateNumber));

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Plates &amp; QR codes</h1>
          <p className="text-sm text-slate-600">
            Print the QR sheet, cut them out and stick one on the back of each
            plate.
          </p>
        </div>
        <Link
          href="/admin/plates/print"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Print QR sheet
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a plate</h2>
        <AddPlateForm />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Plate</th>
              <th className="px-3 py-2 font-semibold">Scan link</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No plates yet.
                </td>
              </tr>
            )}
            {plates.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-bold">{p.plateNumber}</td>
                <td className="px-3 py-2">
                  <a
                    href={`/p/${p.qrSlug}`}
                    className="break-all text-brand underline"
                  >
                    {plateUrl(p.qrSlug)}
                  </a>
                </td>
                <td className="px-3 py-2 text-slate-600">{p.notes || "-"}</td>
                <td className="px-3 py-2">
                  {p.active ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                      Retired
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={setPlateActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={p.active ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className="text-sm font-medium text-slate-600 underline"
                    >
                      {p.active ? "Retire" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
