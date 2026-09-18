"use client";

import { useActionState } from "react";
import { login, type ActionState } from "@/app/actions";
import { Field, FormError, Submit } from "@/components/form";

export default function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(login, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.message} />
      <Field label="Password" htmlFor="password" error={state?.errors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Field>
      <Submit>Sign in</Submit>
    </form>
  );
}
