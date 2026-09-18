import Link from "next/link";

/**
 * Short-form collection notice shown next to the signature box, where the
 * driver is actually handing over their details.
 */
export default function CollectionNotice({
  orgName,
  retentionYears,
}: {
  orgName: string;
  retentionYears: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
      <p>
        <span className="font-semibold text-slate-700">Privacy</span> - your
        name, signature, licence number and trip details are collected by{" "}
        {orgName} to keep the record of use required for this trade plate. They
        may be produced to Transport for NSW, the NSW Police Force or an insurer
        on request, are held in Australia, and are deleted after{" "}
        {retentionYears} year{retentionYears === 1 ? "" : "s"}.{" "}
        <Link href="/privacy" className="font-medium text-brand underline">
          Full privacy notice
        </Link>
        .
      </p>
    </div>
  );
}
