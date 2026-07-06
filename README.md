# Vertical Video Auto-Editor

A brand-aware auto-editing pipeline for turning raw mobile footage into
graded, captioned, vertical (1080x1920) short-form cuts. Next.js (App
Router) frontend/backend, Node.js `fluent-ffmpeg` asset pipeline.

## Requirements

- Node.js 18+
- **ffmpeg and ffprobe on `$PATH`.** This project shells out to a real
  ffmpeg install rather than bundling a binary:
  - Debian/Ubuntu: `apt-get install -y ffmpeg`
  - macOS: `brew install ffmpeg`
  - Or set `FFMPEG_PATH` / `FFPROBE_PATH` env vars to point at specific binaries.
- A bold sans-serif TTF font for captions. The brand profiles look for
  fonts under `public/fonts/` (e.g. `Montserrat-Bold.ttf`, `Inter-SemiBold.ttf`);
  if those aren't present the pipeline falls back to a system font
  (DejaVu Sans Bold / Liberation Sans Bold) if one is installed.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## How it works

1. **Upload** a `.mp4`/`.mov` in the UI, pick a **Brand Profile**, optionally
   paste freeform notes into **Brand Style Guide Override**.
2. `POST /api/process` loads the brand's JSON config from `/config/brands`,
   runs it (plus the override text) through `utils/styleParser.js`, saves the
   upload, and kicks off the render as a background job.
3. `lib/ffmpeg/pipeline.js` runs a single ffmpeg pass that:
   - crops/scales to 1080x1920,
   - applies the brand's contrast/saturation/gamma/color-balance grade
     (+ optional sharpen/vignette),
   - optionally removes breath-pause silences ("jump cuts on breaths") via
     `lib/ffmpeg/silenceCuts.js`, remapping caption timing to match,
   - overlays captions with `drawtext` (position, color, weight, box, case
     driven by the brand config),
   - normalizes audio loudness to the brand's target LUFS (`loudnorm`).
4. The UI polls `GET /api/status/[jobId]` and renders progress in the
   **Processing Dashboard**; completed renders download from
   `GET /api/download/[jobId]`.

## Brand profiles

Each archetype lives at `config/brands/<id>.json` and is validated/clamped
by `utils/styleParser.js` before use:

- `adrian_per` - warm cinematic grade, dark shadows, bold yellow centered titles
- `jefferson_fisher` - clean documentary contrast, zero clutter, jump cuts on breaths
- `chaad_hewitt` - classic newsroom contrast, bold white lower-third subtitles
- `william_scott` - high-clarity exposure, sharp jump cuts, minimal captions

## Style Guide Override

Free text pasted into the override textarea is scanned by a keyword
dictionary (`KEYWORD_RULES` in `utils/styleParser.js`) that translates brand
vocabulary into explicit variables, e.g.:

- "moody" / "dark shadows" -> contrast boost, gamma crush, vignette on
- "minimalist" / "zero clutter" -> caption animations off, no background box
- "lower third" -> captions repositioned with a background box
- "jump cuts" / "sharp cuts" -> breath-pause jump cuts enabled, high sensitivity
- explicit `#RRGGBB` hex codes always win for caption color

Applied rules are returned from `/api/process` and shown per-job in the
dashboard so it's clear what the override actually changed.

## Known limitations

- Job state is an in-memory `Map` (`lib/jobs/jobStore.js`) - it resets on
  server restart and does not scale across multiple server instances. Swap
  in a real queue/DB (Redis, Postgres) for production use.
- `/api/process` starts the render and returns immediately; there's no
  auth or per-user isolation, and uploads/outputs live on local disk
  (`/uploads`, `/output`) rather than object storage.
