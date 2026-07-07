import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { loadBrandProfile, parseStyleOverride } from "@/utils/styleParser";
import { parseCaptionInput, resolveCueTimes } from "@/utils/captionCues";
import { createJob, updateJob } from "@/lib/jobs/jobStore";
import { processVideo } from "@/lib/ffmpeg/pipeline";
import { probeMedia } from "@/lib/ffmpeg/probe";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov"]);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const STYLE_GUIDE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const MAX_STYLE_GUIDE_BYTES = 512 * 1024;

/**
 * The style guide override arrives as an uploaded markdown/text file
 * (styleGuideFile); the raw styleOverride string field is still honored as
 * a fallback for programmatic callers. The file wins when both are sent.
 */
async function readStyleOverride(formData: FormData): Promise<string> {
  const guideFile = formData.get("styleGuideFile");
  if (guideFile instanceof File && guideFile.size > 0) {
    const ext = path.extname(guideFile.name).toLowerCase();
    if (!STYLE_GUIDE_EXTENSIONS.has(ext)) {
      throw new Error(`Style guide must be a .md or .txt file, got "${ext || guideFile.name}"`);
    }
    if (guideFile.size > MAX_STYLE_GUIDE_BYTES) {
      throw new Error("Style guide file exceeds the 512 KB limit");
    }
    return await guideFile.text();
  }
  return (formData.get("styleOverride") as string | null) ?? "";
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const file = formData.get("file");
  const brandId = formData.get("brandId");
  const captionText = formData.get("captionText") as string | null;
  const captionCuesJson = formData.get("captionCuesJson") as string | null;

  let styleOverride: string;
  try {
    styleOverride = await readStyleOverride(formData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing required file upload" }, { status: 400 });
  }
  if (typeof brandId !== "string" || brandId.trim().length === 0) {
    return NextResponse.json({ error: "Missing required brandId" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 2GB upload limit" }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext || file.name}". Only .mp4 and .mov are accepted.` },
      { status: 400 }
    );
  }

  let profile, appliedRules;
  try {
    const baseProfile = loadBrandProfile(brandId);
    ({ profile, appliedRules } = parseStyleOverride(styleOverride, baseProfile));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  let rawCues;
  try {
    rawCues = parseCaptionInput(captionCuesJson, captionText);
  } catch (err: any) {
    return NextResponse.json({ error: `Caption input invalid: ${err.message}` }, { status: 400 });
  }

  const jobId = randomUUID();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const inputPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  // Stream the upload to disk rather than buffering the whole file in memory
  // (uploads can be phone videos in the hundreds of MB or larger).
  try {
    await streamPipeline(Readable.fromWeb(file.stream() as any), fs.createWriteStream(inputPath));
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }

  // Reject non-video payloads before queueing (a renamed .txt should fail
  // here with a clear message, not mid-render).
  let duration: number;
  try {
    const media = await probeMedia(inputPath);
    if (!media.hasVideo) throw new Error("File contains no video stream");
    duration = media.duration;
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Not a readable video file: ${err.message}` }, { status: 400 });
  }

  const captionCues = resolveCueTimes(rawCues, duration);
  createJob({ id: jobId, fileName: file.name, brandId: profile.id, appliedRules });

  // Fire-and-forget: the render can take minutes, so respond with the job id
  // immediately and let the client poll /api/status/[jobId] for progress.
  processVideo({
    inputPath,
    outputPath,
    profile,
    captionCues,
    onProgress: ({ stage, percent }) => {
      updateJob(jobId, { status: "processing", stage, progress: Math.min(99, percent) });
    },
  })
    .then((result) => {
      updateJob(jobId, { status: "completed", stage: null, progress: 100, outputPath: result.outputPath, result });
    })
    .catch((err: any) => {
      updateJob(jobId, { status: "failed", stage: null, error: err.message });
    })
    .finally(() => {
      fs.rm(inputPath, { force: true }, () => {});
    });

  return NextResponse.json({ jobId, brand: profile.id, appliedRules, captionCueCount: captionCues.length });
}
