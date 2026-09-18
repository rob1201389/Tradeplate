"use client";

import { useActionState } from "react";
import { completeTrip, type ActionState } from "@/app/actions";
import SignaturePad from "./SignaturePad";
import CollectionNotice from "./CollectionNotice";
import { DateTimeField, Field, FormError, Submit } from "./form";

export default function TripInForm({
  tripId,
  defaultInAt,
  orgName,
  retentionYears,
}: {
  tripId: number;
  defaultInAt: string;
  orgName: string;
  retentionYears: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    completeTrip,
    null,
  );
  const e = state?.errors ?? {};

  return (
    <form action={action} className="space-y-5">
      <FormError message={state?.message} />
      <input type="hidden" name="tripId" value={tripId} />

      <DateTimeField
        name="inAt"
        label="Date and time in"
        defaultValue={defaultInAt}
        error={e.inAt}
      />

      <Field label="Notes" htmlFor="notes" hint="Optional - damage, delays, fuel">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Field>

      <CollectionNotice orgName={orgName} retentionYears={retentionYears} />

      <SignaturePad
        name="signatureIn"
        label="Driver's signature"
        hint="Sign to confirm the plate has been returned"
      />
      {e.signatureIn && (
        <p className="-mt-3 text-xs font-medium text-red-600">{e.signatureIn}</p>
      )}

      <Submit>Book plate back in</Submit>
    </form>
  );
}
