"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UploadZone from "@/components/UploadZone";
import TranscriptDashboard from "@/components/TranscriptDashboard";
import ModeNav from "@/components/ModeNav";
import type { TranscriptJobSummary } from "@/app/types";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;
const EXTENSIONS = [".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg"];

const MODELS = [
  { id: "small.en", label: "Accurate — English (recommended)", note: "~5–15 min for a 30-min video on a laptop CPU" },
  { id: "base.en", label: "Fast — English", note: "~2–5 min for 30 min; more mistakes on names and jargon" },
  { id: "small", label: "Any language (auto-detect, e.g. Spanish)", note: "Same speed as Accurate; detects the language" },
  { id: "medium", label: "Best — any language (slow)", note: "Highest accuracy; can take 30+ min for 30 min of audio" },
];

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-serif text-sm italic text-muted">{index}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/70">{children}</span>
      <span className="h-px flex-1 self-center bg-line" />
    </div>
  );
}

export default function TranscribePage() {
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [jobs, setJobs] = useState<TranscriptJobSummary[]>([]);
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
          setHealthWarning(`${missing} not found on this machine — transcription is disabled. ${health.hint ?? ""}`);
        }
      })
      .catch(() => {});
  }, []);

  const hasActive = useMemo(() => jobs.some((j) => j.status !== "completed" && j.status !== "failed"), [jobs]);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/transcribe/jobs");
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
    if (!file || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setUploadPercent(0);

    const query = new URLSearchParams({ name: file.name, model });
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/transcribe?${query}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
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
        // Raw file body (not FormData) so the server can stream it to disk.
        xhr.send(file);
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

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-6 pb-16 pt-20">
      <header className="max-w-3xl">
        <div className="mb-8">
          <ModeNav />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted">Transcribe</p>
        <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
          Video in.
          <br />
          <span className="font-serif font-normal italic">Words</span> out.
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
          Drop in a video or audio file of any length. It&rsquo;s transcribed on this machine with Whisper — nothing is
          uploaded to the cloud — and comes back as readable text plus SRT/VTT subtitles.
        </p>
      </header>

      {healthWarning && (
        <div role="alert" className="rounded-xl2 border border-ink/20 bg-surface px-6 py-5 text-sm leading-relaxed">
          <p className="font-semibold">FFmpeg missing</p>
          <p className="mt-1 text-muted">{healthWarning}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-2">
        <div>
          <SectionLabel index="i">File</SectionLabel>
          <UploadZone
            file={file}
            onFileSelected={setFile}
            extensions={EXTENSIONS}
            prompt="Drag & drop a video or audio file, or click to browse"
            hint="mp4, mov, mkv, webm, mp3, m4a, wav… · up to 20 GB"
          />
        </div>

        <div className="flex flex-col gap-12">
          <div>
            <SectionLabel index="ii">Model</SectionLabel>
            <label htmlFor="model" className="mb-2 block text-sm font-medium">
              Speed vs. accuracy
            </label>
            <div className="relative">
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-xl2 border border-line bg-paper px-4 py-3.5 pr-10 text-sm outline-none transition-colors hover:border-ink/30 focus:border-ink"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
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
            <p className="mt-2 text-xs leading-relaxed text-muted">{selectedModel.note}</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={!file || submitting || Boolean(healthWarning)}
              className="rounded-full bg-ink px-8 py-4 text-[15px] font-medium text-paper transition-all hover:opacity-85 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting
                ? uploadPercent !== null && uploadPercent < 100
                  ? `Uploading ${uploadPercent}%`
                  : "Starting…"
                : "Transcribe"}
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
        <SectionLabel index="iii">Transcripts</SectionLabel>
        <TranscriptDashboard jobs={jobs} />
      </section>

      <footer className="mt-auto border-t border-line pt-8">
        <p className="text-[11px] leading-relaxed tracking-wide text-muted">
          On-device Whisper (faster-whisper, int8 CPU) · TXT, SRT, VTT, JSON export · transcripts are kept until the
          server restarts — download what you need
        </p>
      </footer>
    </main>
  );
}
