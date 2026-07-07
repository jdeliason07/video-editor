"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UploadZone from "@/components/UploadZone";
import BrandProfileSelector from "@/components/BrandProfileSelector";
import StyleGuideOverride from "@/components/StyleGuideOverride";
import CaptionInput from "@/components/CaptionInput";
import ProcessingDashboard from "@/components/ProcessingDashboard";
import type { Job } from "@/app/types";

const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 6000;

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="font-mono text-[11px] text-accent/80">{index}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState("");
  const [styleGuideFile, setStyleGuideFile] = useState<File | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [healthWarning, setHealthWarning] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Surface a missing FFmpeg install immediately, before anyone uploads.
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((health) => {
        if (!health.ok) {
          const missing = [!health.ffmpeg && "ffmpeg", !health.ffprobe && "ffprobe"].filter(Boolean).join(" and ");
          setHealthWarning(`${missing} not found on this machine — rendering is disabled. ${health.hint ?? ""}`);
        }
      })
      .catch(() => {});
  }, []);

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => j.status === "queued" || j.status === "processing"),
    [jobs]
  );

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      /* transient poll failure — next tick will retry */
    }
  }, []);

  // Adaptive polling: tight loop while a render is active, relaxed when idle.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      await refreshJobs();
      if (cancelled) return;
      pollTimer.current = setTimeout(tick, hasActiveJobs ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refreshJobs, hasActiveJobs]);

  async function handleSubmit() {
    if (!file || !brandId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brandId", brandId);
      if (styleGuideFile) formData.append("styleGuideFile", styleGuideFile);
      if (captionText.trim()) formData.append("captionText", captionText);

      const res = await fetch("/api/process", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start compilation");

      setFile(null);
      await refreshJobs();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-14">
      <header>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-6 items-center justify-center rounded-md border border-accent/40 bg-accent/10 font-mono text-[10px] font-bold text-accent">
            9:16
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">Vertical Auto-Editor</p>
        </div>
        <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-white">
          Raw footage in, brand-graded vertical cuts out.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Drop in mobile video, pick a brand archetype, and the pipeline crops to 1080×1920, applies the brand color
          grade, cuts breath pauses, overlays captions, and masters audio to −14 LUFS — automatically.
        </p>
      </header>

      {healthWarning && (
        <div
          role="alert"
          className="rounded-xl2 border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
        >
          <p className="font-semibold">FFmpeg missing</p>
          <p className="mt-1 text-amber-200/90">{healthWarning}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <div>
            <SectionLabel index="01">Footage</SectionLabel>
            <UploadZone file={file} onFileSelected={setFile} />
          </div>
          <div>
            <SectionLabel index="02">Brand</SectionLabel>
            <BrandProfileSelector value={brandId} onChange={setBrandId} />
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <SectionLabel index="03">Voice &amp; Overrides</SectionLabel>
            <div className="flex flex-col gap-5">
              <CaptionInput value={captionText} onChange={setCaptionText} />
              <StyleGuideOverride file={styleGuideFile} onFileSelected={setStyleGuideFile} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSubmit}
              disabled={!file || !brandId || submitting || Boolean(healthWarning)}
              className="rounded-xl2 bg-accent px-5 py-3.5 text-sm font-semibold text-ink shadow-[0_0_24px_rgba(232,193,75,0.15)] transition-all hover:opacity-90 hover:shadow-[0_0_32px_rgba(232,193,75,0.25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? "Uploading…" : "Compile vertical cut"}
            </button>
            {submitError && <p className="text-xs text-red-400">{submitError}</p>}
          </div>
        </div>
      </section>

      <section>
        <SectionLabel index="04">Processing Dashboard</SectionLabel>
        <ProcessingDashboard jobs={jobs} />
      </section>

      <footer className="mt-auto border-t border-line pt-6 text-[11px] text-muted/70">
        1080×1920 · H.264 + AAC 48 kHz · EBU R128 two-pass loudness · caption fonts: Outfit &amp; Work Sans (OFL)
      </footer>
    </main>
  );
}
