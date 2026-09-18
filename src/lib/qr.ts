import QRCode from "qrcode";

export function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function plateUrl(qrSlug: string): string {
  return `${baseUrl()}/p/${qrSlug}`;
}

/** Inline SVG so the print sheet needs no image requests. */
export async function qrSvg(url: string, size = 220): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: size,
    errorCorrectionLevel: "M",
  });
}
