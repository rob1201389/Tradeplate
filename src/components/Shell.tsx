export default function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Trade plate record of use
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </header>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {children}
      </div>
    </div>
  );
}
