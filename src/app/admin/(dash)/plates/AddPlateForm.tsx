"use client";

import { useActionState } from "react";
import { addPlate, type ActionState } from "@/app/actions";
import { Field, Text } from "@/components/form";

export default function AddPlateForm() {
  const [state, action] = useActionState<ActionState, FormData>(addPlate, null);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
      <Text
        name="plateNumber"
        label="Plate number"
        placeholder="e.g. 1234 TP"
        autoCapitalize="characters"
        error={state?.errors?.plateNumber}
        required
      />
      <Field label="Expiry date" htmlFor="expiryDate" error={state?.errors?.expiryDate}>
        <input
          id="expiryDate"
          name="expiryDate"
          type="date"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Field>
      <Text name="notes" label="Notes" placeholder="Optional" />
      <button
        type="submit"
        className="h-12 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white"
      >
        Add plate
      </button>
      {state?.message && (
        <p className="text-sm font-medium text-emerald-700 sm:col-span-4">
          {state.message}
        </p>
      )}
    </form>
  );
}
