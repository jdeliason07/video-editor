"use client";

import { useEffect, useState } from "react";
import type { BrandSummary } from "@/app/types";

export default function BrandProfileSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (brandId: string) => void;
}) {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brands")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBrands(data.brands);
        if (!value && data.brands[0]) onChange(data.brands[0].id);
      })
      .catch((err) => setLoadError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = brands.find((b) => b.id === value);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/80">Select Brand Profile</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-white outline-none transition-colors focus:border-accent"
      >
        {brands.length === 0 && <option value="">Loading profiles…</option>}
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name} — {brand.archetype}
          </option>
        ))}
      </select>
      {loadError && <p className="mt-2 text-xs text-red-400">{loadError}</p>}
      {selected && (
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs leading-relaxed text-muted">{selected.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selected.keywords.map((k) => (
              <span key={k} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-white/60">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
