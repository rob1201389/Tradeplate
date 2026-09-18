import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthed())) redirect("/admin/login");

  return (
    <div className="min-h-dvh">
      <nav className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <span className="font-bold text-brand">Trade plates</span>
          <Link href="/admin" className="font-medium hover:underline">
            Records
          </Link>
          <Link href="/admin/plates" className="font-medium hover:underline">
            Plates &amp; QR codes
          </Link>
          <Link href="/" className="font-medium hover:underline">
            Driver view
          </Link>
          <form action={logout} className="ml-auto">
            <button type="submit" className="text-slate-500 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
