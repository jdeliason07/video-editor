import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vertical Auto-Editor",
  description: "Brand-aware vertical video auto-editing pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
