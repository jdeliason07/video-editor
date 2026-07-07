import { NextResponse } from "next/server";
import { listPodcastJobs } from "@/lib/jobs/podcastStore";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: listPodcastJobs() });
}
