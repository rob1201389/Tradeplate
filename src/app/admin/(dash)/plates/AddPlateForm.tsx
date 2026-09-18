"use client";

import { useActionState } from "react";
import { addPlate, type ActionState } from "@/app/actions";
import { Text } from "@/components/form";

export default function AddPlateForm() {
  const [state, action] = useActionState<ActionState, FormData>(addPlate, null);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Text
        name="plateNumber"
        label="Plate number"
        placeholder="e.g. 1234 TP"
        autoCapitalize="characters"
        error={state?.errors?.plateNumber}
        required
      />
      <Text name="notes" label="Notes" placeholder="Optional" />
      <button
        type="submit"
        className="h-12 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white"
      >
        Add plate
      </button>
      {state?.message && (
        <p className="text-sm font-medium text-emerald-700 sm:col-span-3">
          {state.message}
        </p>
      )}
    </form>
  );
}
