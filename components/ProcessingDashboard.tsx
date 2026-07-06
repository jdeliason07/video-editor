"use client";

import { useState } from "react";
import type { Job, JobStage } from "@/app/types";

const STATUS_STYLES: Record<Job["status"], string> = {
  queued: "text-muted border-line",
  processing: "text-accent border-accent/40",
  completed: "text-emerald-400 border-emerald-400/40",
  failed: "text-red-400 border-red-400/40",
};

const STAGE_LABELS: Record<Exclude<JobStage, null>, string> = {
  analyzing: "Analyzing cuts",
  measuring: "Measuring loudness",
  rendering: "Rendering",
};

function statusLabel(job: Job) {
  if (job.status === "processing") return job.stage ? STAGE_LABELS[job.stage] : "Compiling";
  return { queued: "Queued", completed: "Ready", failed: "Failed" }[job.status];
}

function relativeTime(ts: number) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function ProgressBar({ job }: { job: Job }) {
  const width = job.status === "completed" || job.status === "failed" ? 100 : job.progress;
  const color = job.status === "failed" ? "bg-red-400/80" : job.status === "completed" ? "bg-emerald-400" : "bg-accent";
  const active = job.status === "processing" || job.status === "queued";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${color} ${active ? "progress-active" : ""}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function ResultSummary({ job }: { job: Job }) {
  if (!job.result) return null;
  const { result } = job;
  const parts: string[] = [];
  parts.push(`${result.outputDuration.toFixed(1)}s @ 1080×1920`);
  if (result.jumpCutMeta && result.jumpCutMeta.cutsRemoved > 0) {
    const trimmed = result.inputDuration - result.outputDuration;
    parts.push(`${result.jumpCutMeta.cutsRemoved} breath cut${result.jumpCutMeta.cutsRemoved === 1 ? "" : "s"} (−${trimmed.toFixed(1)}s)`);
  }
  parts.push(result.loudness.twoPass ? `${result.loudness.target} LUFS (2-pass)` : `${result.loudness.target} LUFS`);
  return <p className="mt-2 text-xs text-muted">{parts.join(" · ")}</p>;
}

function JobCard({ job }: { job: Job }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="rounded-xl2 border border-line bg-panel px-5 py-4 transition-colors hover:border-white/15">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{job.fileName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {job.brandId} · {relativeTime(job.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[job.status]}`}
        >
          {statusLabel(job)}
          {job.status === "processing" ? ` · ${job.progress}%` : ""}
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar job={job} />
      </div>

      {job.status === "failed" && job.error && (
        <p className="mt-2 break-words text-xs text-red-400">{job.error}</p>
      )}

      <ResultSummary job={job} />

      {job.appliedRules.length > 0 && (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer select-none text-white/60 transition-colors hover:text-white/80">
            {job.appliedRules.length} style override rule{job.appliedRules.length === 1 ? "" : "s"} applied
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {job.appliedRules.map((rule, i) => (
              <li key={`${rule.name}-${i}`} className="list-disc marker:text-accent/60">
                <span className="text-white/70">{rule.name}:</span> {rule.explain}
              </li>
            ))}
          </ul>
        </details>
      )}

      {job.status === "completed" && (
        <div className="mt-3 flex items-center gap-2">
          <a
            href={`/api/download/${job.id}?download=1`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:border-white/30"
          >
            {showPreview ? "Hide preview" : "Preview"}
          </button>
        </div>
      )}

      {job.status === "completed" && showPreview && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={`/api/download/${job.id}`} controls playsInline className="mx-auto max-h-[420px]" />
        </div>
      )}
    </div>
  );
}

export default function ProcessingDashboard({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-line bg-panel/50 px-6 py-12 text-center text-sm text-muted">
        No compilations yet. Upload a clip to start your first render.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
