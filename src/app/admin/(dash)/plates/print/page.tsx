import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { plateUrl, qrSvg } from "@/lib/qr";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** Cut-out labels to stick on the back of each plate. */
export default async function PrintQrPage() {
  const db = getDb();
  const plates = await db
    .select()
    .from(schema.plates)
    .where(eq(schema.plates.active, true))
    .orderBy(asc(schema.plates.plateNumber));

  const cards = await Promise.all(
    plates.map(async (p) => ({
      ...p,
      url: plateUrl(p.qrSlug),
      svg: await qrSvg(plateUrl(p.qrSlug), 200),
    })),
  );

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">QR labels</h1>
          <p className="text-sm text-slate-600">
            Print on adhesive label stock, laminate, then fix to the back of the
            matching plate.
          </p>
        </div>
        <PrintButton label="Print" />
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-slate-600">No active plates to print.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="break-inside-avoid rounded-lg border-2 border-dashed border-slate-400 bg-white p-3 text-center"
            >
              <div className="text-lg font-bold tracking-wide text-black">
                {c.plateNumber}
              </div>
              <div
                className="mx-auto my-2 w-full max-w-[200px] [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">
                Scan before every trip
              </div>
              <div className="mt-1 break-all text-[8px] leading-tight text-slate-500">
                {c.url}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
