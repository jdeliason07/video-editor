"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".mp4", ".mov"];

function isAcceptedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadZone({
  file,
  onFileSelected,
}: {
  file: File | null;
  onFileSelected: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const candidate = files?.[0];
      if (!candidate) return;
      if (!isAcceptedFile(candidate)) {
        setError("Only .mp4 or .mov files are supported.");
        onFileSelected(null);
        return;
      }
      setError(null);
      onFileSelected(candidate);
    },
    [onFileSelected]
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a video file"
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
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl2 border px-6 py-14 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-ink/40 ${
          isDragging
            ? "scale-[1.005] border-ink bg-surface shadow-lift"
            : "border-line bg-surface/60 hover:border-ink/30 hover:bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <svg
          className={`mb-4 h-8 w-8 transition-colors ${isDragging ? "text-ink" : "text-muted group-hover:text-ink"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          aria-hidden
        >
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M12 8v6m0 0 2.5-2.5M12 14l-2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
            <span className="mt-1.5 text-xs text-muted">{formatSize(file.size)} · click or drop to replace</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFileSelected(null);
              }}
              className="mt-4 rounded-full border border-line bg-paper px-4 py-1.5 text-[11px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">Drag &amp; drop a mobile video, or click to browse</span>
            <span className="mt-1.5 text-xs text-muted">.mp4 or .mov · up to 2 GB</span>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-ink">✕ {error}</p>}
    </div>
  );
}
