"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Single clip" },
  { href: "/podcast", label: "Podcast → clips" },
];

export default function ModeNav() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/70 p-1 text-sm">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
              active ? "bg-ink text-paper" : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
