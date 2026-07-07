import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { loadBrandProfile, parseStyleOverride } from "@/utils/styleParser";
import { checkBinaries } from "@/lib/ffmpeg/binaries";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { processPodcast } from "@/lib/podcast/pipeline";
import {
  createPodcastJob,
  updatePodcastJob,
  setClips,
  updateClip,
} from "@/lib/jobs/podcastStore";

export const runtime = "nodejs";
export const maxDuration = 3600;

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4a", ".mp3", ".wav"]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024; // 4GB — podcasts are long

export async function POST(req: NextRequest) {
  const binaries = checkBinaries();
  if (!binaries.ok) {
    return NextResponse.json(
      { error: `The server can't process audio/video: FFmpeg is not available. ${binaries.hint}` },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const brandId = formData.get("brandId");
  const styleGuide = (formData.get("styleGuide") as string | null) ?? "";
  const maxClipsRaw = formData.get("maxClips") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing required file upload" }, { status: 400 });
  }
  if (typeof brandId !== "string" || brandId.trim().length === 0) {
    return NextResponse.json({ error: "Missing required brandId" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 4GB upload limit" }, { status: 413 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext || file.name}". Accepted: mp4, mov, m4a, mp3, wav.` },
      { status: 400 }
    );
  }

  let profile;
  try {
    ({ profile } = parseStyleOverride(styleGuide, loadBrandProfile(brandId)));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const maxClips = maxClipsRaw ? Math.max(1, Math.min(12, parseInt(maxClipsRaw, 10) || 0)) || undefined : undefined;

  const jobId = randomUUID();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const inputPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);

  try {
    await streamPipeline(Readable.fromWeb(file.stream() as any), fs.createWriteStream(inputPath));
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }

  // A podcast may be audio-only (mp3/m4a); only reject files with no audio.
  try {
    const media = await probeMedia(inputPath);
    if (!media.hasAudio) throw new Error("File has no audio track to transcribe");
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Unusable media: ${err.message}` }, { status: 400 });
  }

  createPodcastJob({ id: jobId, fileName: file.name, brandId: profile.id });

  // Fire-and-forget: transcription + rendering can take many minutes.
  processPodcast({
    inputPath,
    outputDir: OUTPUT_DIR,
    jobId,
    profile,
    options: { maxClips },
    hooks: {
      onStage: (stage: string, progress: number) => updatePodcastJob(jobId, { status: stage, stage, progress }),
      onTranscribed: (duration: number) => updatePodcastJob(jobId, { durationSeconds: duration }),
      onClipsPlanned: (clips: any[]) => updatePodcastJob(jobId, { clipsFound: clips.length }) && setClips(jobId, clips),
      onClipStart: (index: number) => updateClip(jobId, index, { status: "rendering" }),
      onClipDone: (index: number, result: any) =>
        updateClip(jobId, index, { status: "completed", outputPath: result.outputPath }),
      onClipError: (index: number, message: string) => updateClip(jobId, index, { status: "failed", error: message }),
    },
  })
    .then(() => updatePodcastJob(jobId, { status: "completed", stage: null, progress: 100 }))
    .catch((err: any) => updatePodcastJob(jobId, { status: "failed", stage: null, error: err.message }))
    .finally(() => fs.rm(inputPath, { force: true }, () => {}));

  return NextResponse.json({ jobId, brand: profile.id });
}
