import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs/jobStore";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
