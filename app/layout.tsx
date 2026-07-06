import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vertical Auto-Editor",
  description: "Brand-aware vertical video auto-editing pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink text-white font-sans antialiased">{children}</body>
    </html>
  );
}
