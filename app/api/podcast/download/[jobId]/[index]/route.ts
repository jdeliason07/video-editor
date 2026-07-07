import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getPodcastJob } from "@/lib/jobs/podcastStore";

export const runtime = "nodejs";

/** Download a single finished clip from a podcast job. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; index: string }> }
) {
  const { jobId, index } = await params;
  const job = getPodcastJob(jobId);
  if (!job) return NextResponse.json({ error: "Unknown job id" }, { status: 404 });

  const clip = job.clips.find((c) => c.index === Number(index));
  if (!clip || !clip.outputPath) {
    return NextResponse.json({ error: "Clip not ready" }, { status: 409 });
  }
  if (!fs.existsSync(clip.outputPath)) {
    return NextResponse.json({ error: "Rendered clip is missing on disk" }, { status: 410 });
  }

  const { size } = fs.statSync(clip.outputPath);
  const asAttachment = req.nextUrl.searchParams.get("download") === "1";
  const slug = (clip.title || `clip-${clip.index}`).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `clip-${clip.index}`;

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="${slug}.mp4"`,
  };

  const range = req.headers.get("range");
  const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : Math.max(0, size - parseInt(rangeMatch[2], 10));
    const end = rangeMatch[1] && rangeMatch[2] ? Math.min(parseInt(rangeMatch[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(clip.outputPath, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(clip.outputPath)) as ReadableStream;
  return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
