import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-16 text-center">
      <h1 className="text-xl font-bold text-ink">Plate not recognised</h1>
      <p className="mt-2 text-sm text-slate-600">
        That QR code is not on file. Check the label is the right one, or pick the
        plate from the list.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
      >
        View plates
      </Link>
    </div>
  );
}
