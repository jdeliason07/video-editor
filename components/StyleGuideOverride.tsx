"use client";

export default function StyleGuideOverride({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/80">Brand Style Guide Override</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={
          "Optional. Paste freeform notes and the parser will translate them into grading, caption, and cut settings.\n\ne.g. \"Keep it moody and cinematic, warm shadows, bold yellow centered titles, no jump cuts.\""
        }
        className="w-full resize-y rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-muted/70 focus:border-accent"
      />
    </div>
  );
}
