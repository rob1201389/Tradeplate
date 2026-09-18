"use client";

import { useActionState } from "react";
import { unlockDriver, type ActionState } from "@/app/actions";
import { Field, FormError, Submit } from "@/components/form";

export default function DriverPinForm({ next }: { next: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    unlockDriver,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.message} />
      <input type="hidden" name="next" value={next} />
      <Field
        label="Access PIN"
        htmlFor="pin"
        error={state?.errors?.pin}
        hint="Asked once on this phone, then remembered for 60 days."
      >
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Field>
      <Submit>Continue</Submit>
    </form>
  );
}
