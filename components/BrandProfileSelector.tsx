"use client";

import { useEffect, useState } from "react";
import type { BrandSummary } from "@/app/types";

/**
 * A miniature 9:16 frame that previews the selected brand's caption
 * treatment — color, position, casing, box — over a simulated grade. The
 * frame's colors are the brand's video output, not site chrome, so they
 * stay true even on the monochrome page.
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
      className={`flex h-44 w-[6.2rem] shrink-0 justify-center overflow-hidden rounded-lg ${positionClass}`}
      style={{
        background: style.vignette
          ? "radial-gradient(closest-side at 50% 45%, #55555f 0%, #17171c 95%)"
          : "linear-gradient(165deg, #45454f 0%, #1c1c22 100%)",
        filter: `contrast(${style.contrast}) saturate(${style.saturation})`,
      }}
      aria-hidden
    >
      <span
        className="max-w-full px-1 text-center text-[9px] font-bold leading-tight"
        style={{
          color: style.captionColor,
          textShadow: style.backgroundBox ? undefined : "0 1px 2px rgba(0,0,0,0.8)",
          backgroundColor: style.backgroundBox
            ? `${style.boxColor}${Math.round(style.boxOpacity * 255)
                .toString(16)
                .padStart(2, "0")}`
            : "transparent",
          padding: style.backgroundBox ? "2px 4px" : undefined,
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
      <label htmlFor="brand-select" className="mb-2 block text-sm font-medium">
        Select Brand Profile
      </label>
      <div className="relative">
        <select
          id="brand-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-xl2 border border-line bg-paper px-4 py-3.5 pr-10 text-sm outline-none transition-colors hover:border-ink/30 focus:border-ink"
        >
          {brands.length === 0 && <option value="">Loading profiles…</option>}
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name} — {brand.archetype}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {loadError && <p className="mt-2 text-xs font-medium">✕ {loadError}</p>}

      {selected && (
        <div className="mt-4 flex gap-5 rounded-xl2 border border-line bg-paper p-5 shadow-card">
          <StylePreview brand={selected} />
          <div className="min-w-0">
            <p className="text-xs leading-relaxed text-muted">{selected.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.keywords.map((k) => (
                <span key={k} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">
                  {k}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-ink/15"
                  style={{ backgroundColor: selected.style.captionColor }}
                />
                caption
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-ink/15"
                  style={{ backgroundColor: selected.style.accentColor }}
                />
                accent
              </span>
              {selected.style.jumpCuts && <span className="italic">breath jump-cuts</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
