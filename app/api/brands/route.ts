import { NextResponse } from "next/server";
import { listBrandProfiles } from "@/utils/styleParser";

export async function GET() {
  try {
    const profiles = listBrandProfiles();
    const summaries = profiles.map((p: any) => ({
      id: p.id,
      name: p.name,
      archetype: p.archetype,
      description: p.description,
      keywords: p.keywords,
    }));
    return NextResponse.json({ brands: summaries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
