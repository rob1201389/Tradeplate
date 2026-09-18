"use client";

import { useState } from "react";
import { setPlateExpiry } from "@/app/actions";
import type { ExpiryState } from "@/lib/time";

const TONE: Record<ExpiryState, string> = {
  none: "bg-slate-200 text-slate-700",
  ok: "bg-emerald-100 text-emerald-800",
  soon: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
};

export default function ExpiryCell({
  id,
  value,
  state,
  label,
}: {
  id: number;
  value: string | null;
  state: ExpiryState;
  label: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[state]}`}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-brand underline"
        >
          {value ? "Change" : "Set"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={setPlateExpiry}
      onSubmit={() => setEditing(false)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="date"
        name="expiryDate"
        defaultValue={value ?? ""}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs font-medium text-slate-500 underline"
      >
        Cancel
      </button>
    </form>
  );
}
