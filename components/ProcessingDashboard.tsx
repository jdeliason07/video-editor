"use client";

import type { Job } from "@/app/types";

const STATUS_STYLES: Record<Job["status"], string> = {
  queued: "text-muted border-line",
  processing: "text-accent border-accent/40",
  completed: "text-emerald-400 border-emerald-400/40",
  failed: "text-red-400 border-red-400/40",
};

const STATUS_LABELS: Record<Job["status"], string> = {
  queued: "Queued",
  processing: "Compiling",
  completed: "Ready",
  failed: "Failed",
};

function ProgressBar({ status, progress }: { status: Job["status"]; progress: number }) {
  const width = status === "completed" ? 100 : status === "failed" ? 100 : progress;
  const color = status === "failed" ? "bg-red-400" : status === "completed" ? "bg-emerald-400" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export default function ProcessingDashboard({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-muted">
        No compilations yet. Upload a clip to start your first render.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <div key={job.id} className="rounded-xl2 border border-line bg-panel px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{job.fileName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {job.brandId} &middot; {new Date(job.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[job.status]}`}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>

          <div className="mt-3">
            <ProgressBar status={job.status} progress={job.progress} />
          </div>

          {job.status === "failed" && job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}

          {job.appliedRules.length > 0 && (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer select-none text-white/60">
                {job.appliedRules.length} style override rule{job.appliedRules.length === 1 ? "" : "s"} applied
              </summary>
              <ul className="mt-2 space-y-1 pl-3">
                {job.appliedRules.map((rule) => (
                  <li key={rule.name} className="list-disc marker:text-accent/60">
                    <span className="text-white/70">{rule.name}:</span> {rule.explain}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {job.jumpCutMeta && job.jumpCutMeta.cutsRemoved > 0 && (
            <p className="mt-2 text-xs text-muted">Removed {job.jumpCutMeta.cutsRemoved} breath pause(s) via jump cuts.</p>
          )}

          {job.status === "completed" && (
            <a
              href={`/api/download/${job.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink transition-opacity hover:opacity-90"
            >
              Download vertical cut
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
