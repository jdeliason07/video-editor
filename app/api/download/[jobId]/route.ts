import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getJob } from "@/lib/jobs/jobStore";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Unknown job id" }, { status: 404 });
  }
  if (job.status !== "completed" || !job.outputPath) {
    return NextResponse.json({ error: `Job is not ready for download (status: ${job.status})` }, { status: 409 });
  }
  if (!fs.existsSync(job.outputPath)) {
    return NextResponse.json({ error: "Rendered file is missing on disk" }, { status: 410 });
  }

  const stat = fs.statSync(job.outputPath);
  const stream = Readable.toWeb(fs.createReadStream(job.outputPath)) as ReadableStream;
  const downloadName = job.fileName ? job.fileName.replace(/\.\w+$/, "") : job.id;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${downloadName}-${job.brandId}.mp4"`,
    },
  });
}
