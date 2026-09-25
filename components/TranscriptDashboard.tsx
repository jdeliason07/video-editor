"use client";

import { useEffect, useState } from "react";
import type { TranscriptJobSummary } from "@/app/types";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  extracting: "Preparing audio",
  transcribing: "Transcribing",
  completed: "Done",
  failed: "Failed",
};

function fmtDuration(s: number) {
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec.toString().padStart(2, "0")}s`;
}

function TranscriptView({ jobId }: { jobId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transcribe/${jobId}/txt`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => !cancelled && setText(body))
      .catch(() => !cancelled && setText("Could not load transcript."));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the download buttons still work */
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["txt", "srt", "vtt", "json"] as const).map((fmt) => (
          <a
            key={fmt}
            href={`/api/transcribe/${jobId}/${fmt}?download=1`}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-85 ${
              fmt === "txt" ? "bg-ink text-paper" : "border border-line hover:border-ink/40"
            }`}
          >
            .{fmt}
          </a>
        ))}
        <button
          type="button"
          onClick={copy}
          disabled={!text}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink/40 disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy text"}
        </button>
      </div>
      <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper px-5 py-4 font-sans text-[14px] leading-relaxed">
        {text ?? "Loading…"}
      </pre>
    </div>
  );
}

function TranscriptCard({ job }: { job: TranscriptJobSummary }) {
  const done = job.status === "completed";
  const failed = job.status === "failed";
  const active = !done && !failed;
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl2 border border-line bg-surface/50 p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{job.fileName}</p>
          <p className="mt-1 text-xs text-muted">
            Whisper {job.model}
            {job.durationSeconds ? ` · ${fmtDuration(job.durationSeconds)} of audio` : ""}
            {job.language ? ` · ${job.language}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              done ? "border-ink bg-ink text-paper" : failed ? "border-ink/50 text-ink" : "border-line text-muted"
            }`}
          >
            {STATUS_LABEL[job.status] ?? job.status}
            {job.status === "transcribing" ? ` ${job.progress}%` : ""}
          </span>
          {done && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:text-ink"
            >
              {open ? "Hide" : "Show"}
            </button>
          )}
        </div>
      </div>

      {active && (
        <>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full bg-ink transition-[width] duration-500 ${job.status !== "transcribing" ? "progress-active" : ""}`}
              style={{ width: `${Math.max(4, job.progress)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {job.status === "transcribing"
              ? "Running locally — you can leave this tab open and come back."
              : "Extracting audio and loading the model (first run downloads it once)…"}
          </p>
        </>
      )}
      {failed && job.error && <p className="mt-3 break-words text-xs text-muted">✕ {job.error}</p>}
      {done && open && <TranscriptView jobId={job.id} />}
    </div>
  );
}

export default function TranscriptDashboard({ jobs }: { jobs: TranscriptJobSummary[] }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-muted">No transcripts yet. Drop a file above to start one.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {jobs.map((job) => (
        <TranscriptCard key={job.id} job={job} />
      ))}
    </div>
  );
}
