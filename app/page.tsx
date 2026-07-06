"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadZone from "@/components/UploadZone";
import BrandProfileSelector from "@/components/BrandProfileSelector";
import StyleGuideOverride from "@/components/StyleGuideOverride";
import ProcessingDashboard from "@/components/ProcessingDashboard";
import type { Job } from "@/app/types";

const POLL_INTERVAL_MS = 2000;

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState("");
  const [styleOverride, setStyleOverride] = useState("");
  const [captionText, setCaptionText] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshJobs = useCallback(() => {
    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshJobs();
    pollTimer.current = setInterval(refreshJobs, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refreshJobs]);

  async function handleSubmit() {
    if (!file || !brandId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brandId", brandId);
      formData.append("styleOverride", styleOverride);
      if (captionText.trim()) formData.append("captionText", captionText.trim());

      const res = await fetch("/api/process", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start compilation");

      setFile(null);
      refreshJobs();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Vertical Auto-Editor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Brand-aware short-form compiler</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Drop in raw mobile footage, pick a brand archetype, and let the pipeline crop to 1080x1920, grade, caption,
          and normalize audio to -14 LUFS automatically.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <UploadZone file={file} onFileSelected={setFile} />
          <BrandProfileSelector value={brandId} onChange={setBrandId} />
          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Caption / Transcript Text (optional)</label>
            <input
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="Text to overlay across the clip, styled per brand"
              className="w-full rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-muted/70 focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <StyleGuideOverride value={styleOverride} onChange={setStyleOverride} />
          <button
            onClick={handleSubmit}
            disabled={!file || !brandId || submitting}
            className="rounded-xl2 bg-accent px-5 py-3 text-sm font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            {submitting ? "Uploading…" : "Compile vertical cut"}
          </button>
          {submitError && <p className="text-xs text-red-400">{submitError}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-white/60">Processing Dashboard</h2>
        <ProcessingDashboard jobs={jobs} />
      </section>
    </main>
  );
}
