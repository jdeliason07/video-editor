"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".mp4", ".mov"];

function isAcceptedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
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
      <label className="mb-2 block text-sm font-medium text-white/80">Raw Footage</label>
      <div
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl2 border border-dashed px-6 py-10 text-center transition-colors ${
          isDragging ? "border-accent bg-accent/5" : "border-line bg-panel hover:border-white/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {file ? (
          <>
            <span className="text-sm font-medium text-white">{file.name}</span>
            <span className="mt-1 text-xs text-muted">{(file.size / (1024 * 1024)).toFixed(1)} MB &middot; click or drop to replace</span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-white/90">Drag & drop a mobile video, or click to browse</span>
            <span className="mt-1 text-xs text-muted">.mp4 or .mov</span>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
