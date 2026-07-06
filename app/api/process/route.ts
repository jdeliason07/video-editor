import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { loadBrandProfile, parseStyleOverride } from "@/utils/styleParser";
import { createJob, updateJob } from "@/lib/jobs/jobStore";
import { processVideo } from "@/lib/ffmpeg/pipeline";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov"]);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

type CaptionCue = { text: string; start: number; end: number };

function parseCaptionCues(captionCuesJson: string | null, captionText: string | null): CaptionCue[] {
  if (captionCuesJson) {
    const parsed = JSON.parse(captionCuesJson);
    if (!Array.isArray(parsed)) throw new Error("captionCuesJson must be a JSON array");
    return parsed.map((cue: any, i: number) => {
      if (typeof cue.text !== "string") throw new Error(`caption cue ${i} is missing "text"`);
      return {
        text: cue.text,
        start: Number(cue.start) || 0,
        end: cue.end != null ? Number(cue.end) : Number(cue.start) + 3,
      };
    });
  }
  if (captionText && captionText.trim().length > 0) {
    // No explicit timing hook supplied: show the caption for the full clip.
    return [{ text: captionText.trim(), start: 0, end: 1e6 }];
  }
  return [];
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const file = formData.get("file");
  const brandId = formData.get("brandId");
  const styleOverride = (formData.get("styleOverride") as string | null) ?? "";
  const captionText = formData.get("captionText") as string | null;
  const captionCuesJson = formData.get("captionCuesJson") as string | null;

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
    return NextResponse.json({ error: `Unsupported file type "${ext}". Only .mp4 and .mov are accepted.` }, { status: 400 });
  }

  let baseProfile;
  try {
    baseProfile = loadBrandProfile(brandId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  let profile;
  let appliedRules;
  try {
    ({ profile, appliedRules } = parseStyleOverride(styleOverride, baseProfile));
  } catch (err: any) {
    return NextResponse.json({ error: `Style override validation failed: ${err.message}` }, { status: 400 });
  }

  let captionCues: CaptionCue[];
  try {
    captionCues = parseCaptionCues(captionCuesJson, captionText);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const jobId = randomUUID();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const inputPath = path.join(UPLOADS_DIR, `${jobId}${ext}`);
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(inputPath, Buffer.from(arrayBuffer));

  createJob({ id: jobId, fileName: file.name, brandId: profile.id, appliedRules });

  // Fire-and-forget: the render can take minutes, so respond with the job id
  // immediately and let the client poll /api/status/[jobId] for progress.
  processVideo({
    inputPath,
    outputPath,
    profile,
    captionCues,
    onProgress: (p) => {
      const percent = typeof p.percent === "number" ? Math.max(0, Math.min(99, Math.round(p.percent))) : undefined;
      updateJob(jobId, { status: "processing", ...(percent !== undefined ? { progress: percent } : {}) });
    },
  })
    .then((result) => {
      updateJob(jobId, { status: "completed", progress: 100, outputPath: result.outputPath, jumpCutMeta: result.jumpCutMeta });
    })
    .catch((err: any) => {
      updateJob(jobId, { status: "failed", error: err.message });
    })
    .finally(() => {
      fs.rm(inputPath, { force: true }, () => {});
    });

  return NextResponse.json({ jobId, brand: profile.id, appliedRules });
}
