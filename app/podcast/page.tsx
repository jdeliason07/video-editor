"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UploadZone from "@/components/UploadZone";
import BrandProfileSelector from "@/components/BrandProfileSelector";
import PodcastDashboard from "@/components/PodcastDashboard";
import ModeNav from "@/components/ModeNav";
import type { PodcastJob } from "@/app/types";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-serif text-sm italic text-muted">{index}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/70">{children}</span>
      <span className="h-px flex-1 self-center bg-line" />
    </div>
  );
}

export default function PodcastPage() {
  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState("");
  const [maxClips, setMaxClips] = useState("auto");
  const [jobs, setJobs] = useState<PodcastJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [healthWarning, setHealthWarning] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((health) => {
        if (!health.ok) {
          const missing = [!health.ffmpeg && "ffmpeg", !health.ffprobe && "ffprobe"].filter(Boolean).join(" and ");
          setHealthWarning(`${missing} not found on this machine — processing is disabled. ${health.hint ?? ""}`);
        }
      })
      .catch(() => {});
  }, []);

  const hasActive = useMemo(
    () => jobs.some((j) => j.status !== "completed" && j.status !== "failed"),
    [jobs]
  );

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/podcast/jobs");
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      await refreshJobs();
      if (cancelled) return;
      pollTimer.current = setTimeout(tick, hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refreshJobs, hasActive]);

  async function handleSubmit() {
    if (!file || !brandId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setUploadPercent(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("brandId", brandId);
    if (maxClips !== "auto") formData.append("maxClips", maxClips);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/podcast");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data: any = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });
      setFile(null);
      await refreshJobs();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
      setUploadPercent(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-6 pb-16 pt-20">
      <header className="max-w-3xl">
        <div className="mb-8">
          <ModeNav />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted">Podcast → Clips</p>
        <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
          One long episode.
          <br />
          <span className="font-serif font-normal italic">Many</span> clips.
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
          Drop in a full episode. It&rsquo;s transcribed on-device, the strongest moments are found automatically, and
          each one comes back as a captioned, brand-graded vertical clip — no timestamps, no manual editing.
        </p>
      </header>

      {healthWarning && (
        <div role="alert" className="rounded-xl2 border border-ink/20 bg-surface px-6 py-5 text-sm leading-relaxed">
          <p className="font-semibold">FFmpeg missing</p>
          <p className="mt-1 text-muted">{healthWarning}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-2">
        <div className="flex flex-col gap-12">
          <div>
            <SectionLabel index="i">Episode</SectionLabel>
            <UploadZone file={file} onFileSelected={setFile} />
          </div>
          <div>
            <SectionLabel index="ii">Brand</SectionLabel>
            <BrandProfileSelector value={brandId} onChange={setBrandId} />
          </div>
        </div>

        <div className="flex flex-col gap-12">
          <div>
            <SectionLabel index="iii">Clips</SectionLabel>
            <label htmlFor="max-clips" className="mb-2 block text-sm font-medium">
              How many clips?
            </label>
            <div className="relative">
              <select
                id="max-clips"
                value={maxClips}
                onChange={(e) => setMaxClips(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-xl2 border border-line bg-paper px-4 py-3.5 pr-10 text-sm outline-none transition-colors hover:border-ink/30 focus:border-ink"
              >
                <option value="auto">Auto (scale to episode length)</option>
                <option value="3">Up to 3</option>
                <option value="5">Up to 5</option>
                <option value="8">Up to 8</option>
                <option value="12">Up to 12</option>
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
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Transcription runs locally, so a full episode takes several minutes — the card below tracks each stage.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={!file || !brandId || submitting || Boolean(healthWarning)}
              className="rounded-full bg-ink px-8 py-4 text-[15px] font-medium text-paper transition-all hover:opacity-85 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting
                ? uploadPercent !== null && uploadPercent < 100
                  ? `Uploading ${uploadPercent}%`
                  : "Starting…"
                : "Find the clips"}
            </button>
            {submitting && uploadPercent !== null && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full bg-ink transition-[width] duration-200 ${uploadPercent >= 100 ? "progress-active" : ""}`}
                  style={{ width: `${Math.max(4, uploadPercent)}%` }}
                />
              </div>
            )}
            {submitError && <p className="text-xs text-muted">✕ {submitError}</p>}
          </div>
        </div>
      </section>

      <section>
        <SectionLabel index="iv">Episodes</SectionLabel>
        <PodcastDashboard jobs={jobs} />
      </section>

      <footer className="mt-auto border-t border-line pt-8">
        <p className="text-[11px] leading-relaxed tracking-wide text-muted">
          On-device transcription (Whisper) · heuristic highlight selection · 1080 × 1920 clips, −14 LUFS, auto-captions
        </p>
      </footer>
    </main>
  );
}
