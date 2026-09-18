export type FieldErrors = Record<string, string>;

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function required(
  errors: FieldErrors,
  key: string,
  value: string,
  label: string,
  max = 200,
): string {
  if (!value) errors[key] = `${label} is required`;
  else if (value.length > max) errors[key] = `${label} is too long`;
  return value;
}

/** Signature pads produce base64 PNG data URLs; reject anything else. */
export function signature(value: string): string | null {
  if (!value) return null;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  // ~1.5MB of base64 is plenty for a 600x200 signature.
  if (value.length > 1_500_000) return null;
  return value;
}
