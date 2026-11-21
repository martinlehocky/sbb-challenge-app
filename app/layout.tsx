import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SBB Disruption Kiosk – LauzHack 2026 demo",
  description:
    "Clickable front-end of the station disruption kiosk (mock data only).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="sbb-light">
      <body>{children}</body>
    </html>
  );
}
