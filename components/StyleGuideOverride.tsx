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
      <label className="mb-2 block text-sm font-medium">
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
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl2 border px-5 py-8 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-ink/40 ${
          isDragging
            ? "scale-[1.005] border-ink bg-surface shadow-lift"
            : "border-line bg-surface/60 hover:border-ink/30 hover:bg-surface"
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
          className={`mb-3 h-6 w-6 transition-colors ${isDragging ? "text-ink" : "text-muted group-hover:text-ink"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          aria-hidden
        >
          <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14 2.5Z" strokeLinejoin="round" />
          <path d="M14 2.5v5h5M9 12h6M9 15.5h6M9 8.5h2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
            <span className="mt-1.5 text-xs text-muted">
              {(file.size / 1024).toFixed(1)} KB · click or drop to replace
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="mt-3 rounded-full border border-line bg-paper px-4 py-1.5 text-[11px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">Drop a markdown style guide, or click to browse</span>
            <span className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
              .md or .txt — brand words &amp; directives become grade, caption, and cut settings
            </span>
          </>
        )}
      </div>

      {file && excerpt && (
        <pre className="mt-3 max-h-28 overflow-hidden whitespace-pre-wrap border-l-2 border-ink/15 py-1 pl-4 font-serif text-xs italic leading-relaxed text-muted">
          {excerpt}
        </pre>
      )}
      {error && <p className="mt-2 text-xs font-medium">✕ {error}</p>}
    </div>
  );
}
