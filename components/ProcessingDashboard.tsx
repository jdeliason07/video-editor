"use client";

import { useState } from "react";
import type { Job, JobStage } from "@/app/types";

const STATUS_STYLES: Record<Job["status"], string> = {
  queued: "border-line text-muted",
  processing: "border-ink/30 text-ink",
  completed: "border-ink bg-ink text-paper",
  failed: "border-ink/60 text-ink",
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
  const active = job.status === "processing" || job.status === "queued";
  const fill = job.status === "failed" ? "bg-ink/25" : "bg-ink";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fill} ${active ? "progress-active" : ""}`}
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
    parts.push(
      `${result.jumpCutMeta.cutsRemoved} breath cut${result.jumpCutMeta.cutsRemoved === 1 ? "" : "s"} (−${trimmed.toFixed(1)}s)`
    );
  }
  parts.push(result.loudness.twoPass ? `${result.loudness.target} LUFS, two-pass` : `${result.loudness.target} LUFS`);
  return <p className="mt-2.5 text-xs text-muted">{parts.join(" · ")}</p>;
}

function JobCard({ job }: { job: Job }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="rounded-xl2 border border-line bg-paper px-6 py-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.fileName}</p>
          <p className="mt-1 text-xs text-muted">
            {job.brandId} · {relativeTime(job.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${STATUS_STYLES[job.status]}`}
        >
          {statusLabel(job)}
          {job.status === "processing" ? ` · ${job.progress}%` : ""}
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar job={job} />
      </div>

      {job.status === "failed" && job.error && (
        <p className="mt-2.5 break-words text-xs leading-relaxed text-muted">✕ {job.error}</p>
      )}

      <ResultSummary job={job} />

      {job.appliedRules.length > 0 && (
        <details className="mt-2.5 text-xs text-muted">
          <summary className="cursor-pointer select-none transition-colors hover:text-ink">
            {job.appliedRules.length} style override rule{job.appliedRules.length === 1 ? "" : "s"} applied
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {job.appliedRules.map((rule, i) => (
              <li key={`${rule.name}-${i}`} className="list-disc marker:text-ink/30">
                <span className="text-ink/80">{rule.name}:</span> {rule.explain}
              </li>
            ))}
          </ul>
        </details>
      )}

      {job.status === "completed" && (
        <div className="mt-4 flex items-center gap-2.5">
          <a
            href={`/api/download/${job.id}?download=1`}
            className="inline-flex items-center rounded-full bg-ink px-5 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-85"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center rounded-full border border-line px-5 py-2 text-xs font-medium text-ink transition-colors hover:border-ink/40"
          >
            {showPreview ? "Hide preview" : "Preview"}
          </button>
        </div>
      )}

      {job.status === "completed" && showPreview && (
        <div className="mt-4 overflow-hidden rounded-xl bg-ink">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={`/api/download/${job.id}`} controls playsInline className="mx-auto max-h-[440px]" />
        </div>
      )}
    </div>
  );
}

export default function ProcessingDashboard({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-surface/60 px-6 py-14 text-center">
        <p className="font-serif text-sm italic text-muted">Nothing here yet — your first cut begins above.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
