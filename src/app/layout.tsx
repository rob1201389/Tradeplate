import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Plate Record of Use",
  description:
    "Record of use for NSW trade plates - date and time out, driver, vehicle, destination, time in and signature.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
