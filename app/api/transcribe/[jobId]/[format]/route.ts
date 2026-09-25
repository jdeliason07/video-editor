import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getTranscriptJob } from "@/lib/jobs/transcriptStore";
import { FORMATS } from "@/lib/transcribe/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/transcribe/:jobId/:format  (txt | srt | vtt | json); ?download=1 for an attachment. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; format: string }> }) {
  const { jobId, format } = await params;
  const job = getTranscriptJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed" || !job.transcript) {
    return NextResponse.json({ error: "Transcript is not ready yet" }, { status: 409 });
  }
  const spec = (FORMATS as Record<string, { render: (t: unknown) => string; contentType: string }>)[format];
  if (!spec) return NextResponse.json({ error: `Unknown format "${format}"` }, { status: 400 });

  const headers: Record<string, string> = { "Content-Type": spec.contentType, "Cache-Control": "no-store" };
  if (req.nextUrl.searchParams.get("download")) {
    const base = path.basename(job.fileName, path.extname(job.fileName)).replace(/[^\w.\- ]+/g, "_") || "transcript";
    headers["Content-Disposition"] = `attachment; filename="${base}.${format}"`;
  }
  return new NextResponse(spec.render(job.transcript), { headers });
}
