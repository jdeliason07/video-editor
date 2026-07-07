"use client";

import { useState } from "react";
import type { PodcastJob, PodcastClip } from "@/app/types";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  transcribing: "Transcribing",
  selecting: "Finding highlights",
  rendering: "Rendering clips",
  completed: "Done",
  failed: "Failed",
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ClipRow({ jobId, clip }: { jobId: string; clip: PodcastClip }) {
  const [preview, setPreview] = useState(false);
  const ready = clip.status === "completed";
  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{clip.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {fmtTime(clip.start)}–{fmtTime(clip.end)} · {Math.round(clip.end - clip.start)}s
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            ready
              ? "border-ink bg-ink text-paper"
              : clip.status === "failed"
                ? "border-ink/50 text-ink"
                : "border-line text-muted"
          }`}
        >
          {ready ? "Ready" : clip.status === "rendering" ? "Rendering" : clip.status === "failed" ? "Failed" : "Queued"}
        </span>
      </div>
      {clip.status === "failed" && clip.error && <p className="mt-1.5 text-xs text-muted">✕ {clip.error}</p>}
      {ready && (
        <div className="mt-2.5 flex items-center gap-2">
          <a
            href={`/api/podcast/download/${jobId}/${clip.index}?download=1`}
            className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-85"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink/40"
          >
            {preview ? "Hide" : "Preview"}
          </button>
        </div>
      )}
      {ready && preview && (
        <div className="mt-2.5 overflow-hidden rounded-lg bg-ink">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={`/api/podcast/download/${jobId}/${clip.index}`} controls playsInline className="mx-auto max-h-[380px]" />
        </div>
      )}
    </div>
  );
}

function PodcastCard({ job }: { job: PodcastJob }) {
  const done = job.status === "completed";
  const failed = job.status === "failed";
  const active = !done && !failed;
  return (
    <div className="rounded-xl2 border border-line bg-surface/50 p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.fileName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {job.brandId}
            {job.durationSeconds ? ` · ${fmtTime(job.durationSeconds)} source` : ""}
            {job.clipsFound != null ? ` · ${job.clipsFound} clip${job.clipsFound === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-ink/30 px-3 py-1 text-[11px] font-medium">
          {STAGE_LABEL[job.status] ?? job.status}
          {active ? ` · ${job.progress}%` : ""}
        </span>
      </div>

      {active && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="progress-active h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${Math.max(4, job.progress)}%` }}
          />
        </div>
      )}

      {failed && job.error && <p className="mt-2 text-xs text-muted">✕ {job.error}</p>}

      {job.clips.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {job.clips.map((clip) => (
            <ClipRow key={clip.index} jobId={job.id} clip={clip} />
          ))}
        </div>
      )}

      {active && job.clips.length === 0 && (
        <p className="mt-3 font-serif text-sm italic text-muted">
          {job.status === "transcribing"
            ? "Listening to the whole episode…"
            : job.status === "selecting"
              ? "Reading the transcript for the best moments…"
              : "Warming up…"}
        </p>
      )}
    </div>
  );
}

export default function PodcastDashboard({ jobs }: { jobs: PodcastJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-surface/60 px-6 py-14 text-center">
        <p className="font-serif text-sm italic text-muted">
          Upload a podcast and it&rsquo;ll come back as a set of clips.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {jobs.map((job) => (
        <PodcastCard key={job.id} job={job} />
      ))}
    </div>
  );
}
