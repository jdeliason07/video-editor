"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".txt"];
const MAX_SIZE_BYTES = 512 * 1024;
const EXCERPT_CHARS = 220;

function isAcceptedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function StyleGuideOverride({
  file,
  onFileSelected,
}: {
  file: File | null;
  onFileSelected: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const candidate = files?.[0];
      if (!candidate) return;
      if (!isAcceptedFile(candidate)) {
        setError("Only .md or .txt style guides are supported.");
        return;
      }
      if (candidate.size > MAX_SIZE_BYTES) {
        setError("Style guide is too large (512 KB max).");
        return;
      }
      setError(null);
      onFileSelected(candidate);
      candidate
        .slice(0, EXCERPT_CHARS + 64)
        .text()
        .then((head) => {
          const trimmed = head.trim();
          setExcerpt(trimmed.length > EXCERPT_CHARS ? `${trimmed.slice(0, EXCERPT_CHARS)}…` : trimmed);
        })
        .catch(() => setExcerpt(null));
    },
    [onFileSelected]
  );

  const clear = () => {
    onFileSelected(null);
    setExcerpt(null);
    setError(null);
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/80">
        Brand Style Guide Override <span className="font-normal text-muted">(optional)</span>
      </label>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a markdown style guide"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl2 border border-dashed px-5 py-7 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/60 ${
          isDragging
            ? "scale-[1.01] border-accent bg-accent/[0.06]"
            : "border-line bg-panel hover:border-white/30 hover:bg-panel/70"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <svg
          className={`mb-2 h-6 w-6 transition-colors ${isDragging ? "text-accent" : "text-muted group-hover:text-white/70"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14 2.5Z" strokeLinejoin="round" />
          <path d="M14 2.5v5h5M9 12h6M9 15.5h6M9 8.5h2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-medium text-white">{file.name}</span>
            <span className="mt-1 text-xs text-muted">
              {(file.size / 1024).toFixed(1)} KB · click or drop to replace
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="mt-2.5 rounded-full border border-line px-3 py-1 text-[11px] text-muted transition-colors hover:border-red-400/50 hover:text-red-400"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-white/90">Drop a markdown style guide, or click to browse</span>
            <span className="mt-1 text-xs text-muted">
              .md or .txt — brand words &amp; directives are translated into grade, caption, and cut settings
            </span>
          </>
        )}
      </div>

      {file && excerpt && (
        <pre className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-muted">
          {excerpt}
        </pre>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
