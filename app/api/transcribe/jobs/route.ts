import { NextResponse } from "next/server";
import { listTranscriptJobs } from "@/lib/jobs/transcriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: listTranscriptJobs() });
}
