import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getJob } from "@/lib/jobs/jobStore";

export const runtime = "nodejs";

/**
 * Serves a completed render. Supports HTTP Range requests so the dashboard's
 * inline <video> preview can seek; `?download=1` switches to an attachment
 * disposition for the download button.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
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

  const { size } = fs.statSync(job.outputPath);
  const asAttachment = req.nextUrl.searchParams.get("download") === "1";
  const downloadName = `${(job.fileName || job.id).replace(/\.\w+$/, "")}-${job.brandId}.mp4`;

  const baseHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="${downloadName}"`,
  };

  const range = req.headers.get("range");
  const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : Math.max(0, size - parseInt(rangeMatch[2], 10));
    const end = rangeMatch[1] && rangeMatch[2] ? Math.min(parseInt(rangeMatch[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(job.outputPath, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(job.outputPath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
