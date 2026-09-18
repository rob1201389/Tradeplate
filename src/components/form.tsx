"use client";

import { useFormStatus } from "react-dom";
import { useRef } from "react";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function Text({
  name,
  label,
  error,
  hint,
  defaultValue,
  placeholder,
  required,
  autoCapitalize,
  inputMode,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  autoCapitalize?: "none" | "words" | "characters";
  inputMode?: "text" | "numeric";
}) {
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoCapitalize={autoCapitalize ?? "words"}
        autoComplete="off"
        inputMode={inputMode}
        className={inputClass}
      />
    </Field>
  );
}

export function Select({
  name,
  label,
  error,
  hint,
  defaultValue,
  options,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={inputClass}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * `datetime-local` prefilled with NSW local time by the server, plus a "Now"
 * button that recomputes NSW time on the device.
 */
export function DateTimeField({
  name,
  label,
  defaultValue,
  error,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function setNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    if (ref.current) {
      ref.current.value = `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
    }
  }

  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <div className="mt-1 flex gap-2">
        <input
          ref={ref}
          id={name}
          name={name}
          type="datetime-local"
          defaultValue={defaultValue}
          required
          className={inputClass.replace("mt-1 ", "")}
        />
        <button
          type="button"
          onClick={setNow}
          className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700"
        >
          Now
        </button>
      </div>
    </Field>
  );
}

export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-4 text-base font-semibold text-white shadow-sm active:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Saving..." : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}
