import { NextResponse } from "next/server";
import { checkBinaries } from "@/lib/ffmpeg/binaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Environment readiness for the UI: is a working ffmpeg/ffprobe install present? */
export async function GET() {
  return NextResponse.json(checkBinaries());
}
