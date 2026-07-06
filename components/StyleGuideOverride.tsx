"use client";

const PLACEHOLDER = `Optional. Paste freeform notes or markdown — brand words are translated into grading, caption, and cut settings.

e.g. "Moody and cinematic. Warm shadows, bold yellow centered titles, no jump cuts."

Explicit directives also work, one per line:
- contrast: 1.3
- caption color: #FF5500
- position: lower-third`;

export default function StyleGuideOverride({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label htmlFor="style-override" className="mb-2 block text-sm font-medium text-white/80">
        Brand Style Guide Override
      </label>
      <textarea
        id="style-override"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={9}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        className="w-full resize-y rounded-xl2 border border-line bg-panel px-4 py-3 font-mono text-[13px] leading-relaxed text-white outline-none transition-colors placeholder:font-sans placeholder:text-muted/60 focus:border-accent"
      />
    </div>
  );
}
