import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import LoginForm from "./LoginForm";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/admin");
  return (
    <Shell title="Office login" subtitle="For viewing and exporting records.">
      <LoginForm />
    </Shell>
  );
}
