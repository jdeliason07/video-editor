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
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-serif text-sm italic text-muted">{index}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/70">{children}</span>
      <span className="h-px flex-1 self-center bg-line" />
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
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
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
    setUploadPercent(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("brandId", brandId);
    if (styleGuideFile) formData.append("styleGuideFile", styleGuideFile);
    if (captionText.trim()) formData.append("captionText", captionText);

    try {
      // XHR (not fetch) so we can show real upload progress — for a large 4K
      // phone video the upload is the longest, most opaque part of the wait.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/process");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data: any = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON error body */
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
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted">Vertical Auto-Editor</p>
        <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
          Footage in.
          <br />
          <span className="font-serif font-normal italic">Cinema</span> out.
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
          Every frame composed for 1080×1920. A brand&rsquo;s grade, its typography, its pacing — applied the moment
          your footage arrives, mastered to −14&nbsp;LUFS.
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
            <SectionLabel index="i">Footage</SectionLabel>
            <UploadZone file={file} onFileSelected={setFile} />
          </div>
          <div>
            <SectionLabel index="ii">Brand</SectionLabel>
            <BrandProfileSelector value={brandId} onChange={setBrandId} />
          </div>
        </div>

        <div className="flex flex-col gap-12">
          <div>
            <SectionLabel index="iii">Voice &amp; Overrides</SectionLabel>
            <div className="flex flex-col gap-6">
              <CaptionInput value={captionText} onChange={setCaptionText} />
              <StyleGuideOverride file={styleGuideFile} onFileSelected={setStyleGuideFile} />
            </div>
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
                  : "Starting render…"
                : "Compile vertical cut"}
            </button>
            {submitting && uploadPercent !== null && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-line" aria-label="Upload progress">
                <div
                  className={`h-full rounded-full bg-ink transition-[width] duration-200 ${uploadPercent >= 100 ? "progress-active" : ""}`}
                  style={{ width: `${Math.max(4, uploadPercent)}%` }}
                />
              </div>
            )}
            {submitting && (
              <p className="text-xs text-muted">
                {uploadPercent !== null && uploadPercent < 100
                  ? "Sending your footage to the server…"
                  : "Upload complete — the render appears below and tracks its own progress."}
              </p>
            )}
            {submitError && <p className="text-xs text-muted">✕ {submitError}</p>}
          </div>
        </div>
      </section>

      <section>
        <SectionLabel index="iv">Processing</SectionLabel>
        <ProcessingDashboard jobs={jobs} />
      </section>

      <footer className="mt-auto border-t border-line pt-8">
        <p className="text-[11px] leading-relaxed tracking-wide text-muted">
          1080 × 1920 &nbsp;·&nbsp; H.264, AAC 48 kHz &nbsp;·&nbsp; EBU R128, two-pass &nbsp;·&nbsp; Outfit &amp; Work
          Sans, OFL
        </p>
      </footer>
    </main>
  );
}
