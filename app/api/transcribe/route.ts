import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { checkBinaries } from "@/lib/ffmpeg/binaries";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { transcribe } from "@/lib/transcribe";
import { createTranscriptJob, updateTranscriptJob } from "@/lib/jobs/transcriptStore";

export const runtime = "nodejs";
export const maxDuration = 3600;

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg"]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024; // 20GB — long 4K phone footage adds up fast
// Whisper checkpoints offered in the UI. Anything else is rejected so the
// query string can't point the transcriber at an arbitrary model download.
const MODELS = new Set(["base.en", "small.en", "small", "medium"]);
const DEFAULT_MODEL = "small.en";

/**
 * Upload is the raw file as the request body (not multipart), with the name
 * and options in the query string. That lets it stream straight to disk:
 * `req.formData()` would buffer a multi-GB video in memory first.
 *
 *   POST /api/transcribe?name=talk.mp4&model=small.en
 */
export async function POST(req: NextRequest) {
  const binaries = checkBinaries();
  if (!binaries.ok) {
    return NextResponse.json(
      { error: `The server can't process audio/video: FFmpeg is not available. ${binaries.hint}` },
      { status: 503 }
    );
  }

  const params = req.nextUrl.searchParams;
  const fileName = path.basename(params.get("name") ?? "");
  const model = params.get("model") || DEFAULT_MODEL;
  const ext = path.extname(fileName).toLowerCase();

  if (!fileName || !req.body) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext || fileName}". Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}.` },
      { status: 400 }
    );
  }
  if (!MODELS.has(model)) {
    return NextResponse.json({ error: `Unknown model "${model}"` }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 20GB upload limit" }, { status: 413 });
  }

  const jobId = randomUUID();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const inputPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);

  // Enforce the cap on bytes actually received, not just the declared length.
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES) return cb(new Error("File exceeds the 20GB upload limit"));
      cb(null, chunk);
    },
  });

  try {
    await streamPipeline(Readable.fromWeb(req.body as any), limiter, fs.createWriteStream(inputPath));
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
  if (received === 0) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }

  try {
    const media = await probeMedia(inputPath);
    if (!media.hasAudio) throw new Error("File has no audio track to transcribe");
  } catch (err: any) {
    fs.rmSync(inputPath, { force: true });
    return NextResponse.json({ error: `Unusable media: ${err.message}` }, { status: 400 });
  }

  createTranscriptJob({ id: jobId, fileName, model });
  updateTranscriptJob(jobId, { status: "extracting" });

  // Fire-and-forget: a 30-minute file takes minutes on CPU; the UI polls.
  transcribe(
    inputPath,
    (fraction: number) => updateTranscriptJob(jobId, { status: "transcribing", progress: Math.round(fraction * 100) }),
    { model, wordTimestamps: false }
  )
    .then((transcript: any) =>
      updateTranscriptJob(jobId, {
        status: "completed",
        progress: 100,
        transcript,
        durationSeconds: transcript.duration,
        language: transcript.language,
      })
    )
    .catch((err: any) => updateTranscriptJob(jobId, { status: "failed", error: err.message }))
    .finally(() => fs.rm(inputPath, { force: true }, () => {}));

  return NextResponse.json({ jobId });
}
