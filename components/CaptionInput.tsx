"use client";

export default function CaptionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label htmlFor="caption-input" className="mb-2 block text-sm font-medium text-white/80">
        Captions / Transcript <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="caption-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={
          "A line of text to overlay, styled per brand — or paste full SRT subtitles for timed captions."
        }
        className="w-full resize-y rounded-xl2 border border-line bg-panel px-4 py-3 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
      />
    </div>
  );
}
