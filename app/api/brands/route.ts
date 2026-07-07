import { NextResponse } from "next/server";
import { listBrandProfiles } from "@/utils/styleParser";

export const runtime = "nodejs";

/** Brand summaries for the selector UI, including enough style data to render swatches. */
export async function GET() {
  try {
    const brands = listBrandProfiles().map((p) => ({
      id: p.id,
      name: p.name,
      archetype: p.archetype,
      description: p.description,
      keywords: p.keywords,
      style: {
        captionColor: p.captions.primaryColor,
        accentColor: p.captions.secondaryColor,
        captionPosition: p.captions.position,
        backgroundBox: p.captions.backgroundBox,
        boxColor: p.captions.boxColor,
        boxOpacity: p.captions.boxOpacity,
        uppercase: p.captions.uppercase,
        contrast: p.video.contrast,
        saturation: p.video.saturation,
        vignette: p.video.vignette,
        jumpCuts: p.editing.jumpCutOnBreaths,
      },
    }));
    return NextResponse.json({ brands });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
