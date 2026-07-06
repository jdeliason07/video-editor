import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/jobStore";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Unknown job id" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
