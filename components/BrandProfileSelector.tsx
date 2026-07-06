"use client";

import { useEffect, useState } from "react";
import type { BrandSummary } from "@/app/types";

/**
 * A miniature 9:16 frame that previews the selected brand's caption
 * treatment: color, position, and casing, over a CSS-simulated grade.
 */
function StylePreview({ brand }: { brand: BrandSummary }) {
  const { style } = brand;
  const positionClass =
    style.captionPosition === "lower-third"
      ? "items-end pb-5"
      : style.captionPosition === "top"
        ? "items-start pt-4"
        : "items-center";
  return (
    <div
      className={`flex h-40 w-[5.6rem] shrink-0 justify-center overflow-hidden rounded-lg border border-line ${positionClass}`}
      style={{
        background: style.vignette
          ? "radial-gradient(closest-side at 50% 45%, #4a4a55 0%, #17171c 95%)"
          : "linear-gradient(165deg, #3d3d47 0%, #1c1c22 100%)",
        filter: `contrast(${style.contrast}) saturate(${style.saturation})`,
      }}
      aria-hidden
    >
      <span
        className="max-w-full px-1 text-center text-[9px] font-bold leading-tight"
        style={{
          color: style.captionColor,
          textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          backgroundColor: style.captionPosition === "lower-third" ? "rgba(0,0,0,0.55)" : "transparent",
          padding: style.captionPosition === "lower-third" ? "2px 4px" : undefined,
        }}
      >
        {style.uppercase ? "YOUR TITLE" : "Your title"}
      </span>
    </div>
  );
}

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
      <label htmlFor="brand-select" className="mb-2 block text-sm font-medium text-white/80">
        Select Brand Profile
      </label>
      <select
        id="brand-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-white outline-none transition-colors focus:border-accent"
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
        <div className="mt-3 flex gap-4 rounded-xl2 border border-line bg-surface p-4">
          <StylePreview brand={selected} />
          <div className="min-w-0">
            <p className="text-xs leading-relaxed text-muted">{selected.description}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {selected.keywords.map((k) => (
                <span key={k} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-white/60">
                  {k}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/20"
                  style={{ backgroundColor: selected.style.captionColor }}
                />
                caption
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/20"
                  style={{ backgroundColor: selected.style.accentColor }}
                />
                accent
              </span>
              {selected.style.jumpCuts && <span className="text-accent/80">✂ breath jump-cuts</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
