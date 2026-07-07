# Vertical Video Auto-Editor

A brand-aware auto-editing pipeline that turns raw mobile footage into
graded, captioned, vertical (1080×1920) short-form cuts. Next.js (App
Router) frontend/backend with a Node.js `fluent-ffmpeg` asset pipeline.

## Requirements

- Node.js 18+
- **ffmpeg and ffprobe on `$PATH`.** The pipeline shells out to a real
  ffmpeg install rather than bundling a binary:
  - Debian/Ubuntu: `apt-get install -y ffmpeg`
  - macOS: `brew install ffmpeg`
  - Or set `FFMPEG_PATH` / `FFPROBE_PATH` to point at specific binaries.

Caption fonts (Outfit Bold, Work Sans Bold — both SIL OFL, licenses
alongside the files) are bundled in `public/fonts/`, so drawtext output is
deterministic. If a brand's font file is missing, the pipeline falls back
to a system font (DejaVu / Liberation).

**For the Podcast → Clips feature** you also need Python 3 and local
Whisper: `pip install -r requirements.txt` (installs `faster-whisper`). The
Docker image bundles this and pre-downloads the model; a local dev server
needs it installed separately. Transcription is CPU-heavy — budget ~1 GB RAM
and expect a full episode to take several minutes on a modest machine.

## Setup

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (node:test) for the parser, cut planner, and filter builders
```

To host it in the cloud (use it from your phone anywhere, no laptop
running), see **[DEPLOY.md](DEPLOY.md)** — the repo ships a Dockerfile with
FFmpeg baked in that deploys as-is to Railway, Render, or Fly.io.

## How a render works

1. **Upload** a `.mp4`/`.mov`, pick a **Brand Profile**, optionally add
   captions (plain text or pasted SRT) and drop a markdown/text **Brand
   Style Guide** file into the override zone.
2. `POST /api/process` streams the upload to disk, probes it, validates the
   brand config + override through `utils/styleParser.js`, and starts the
   render as a background job.
3. `lib/ffmpeg/pipeline.js` then runs:
   - **silence analysis** (only for jump-cut brands) — `silencedetect`
     finds breath pauses; `planCuts` keeps only silences long enough for
     the brand's cut sensitivity, pads cut edges so words aren't clipped,
     and skips any cut that would leave a shot shorter than
     `editing.minShotSeconds`;
   - **loudness measurement** — `loudnorm` pass 1 measures the programme
     loudness of the *post-cut* audio;
   - **one encode pass** — scale/crop to 1080×1920, the brand's
     eq/colorbalance/unsharp/vignette grade, `select`/`aselect` jump cuts
     with caption timing remapped to the post-cut timeline, per-cue
     `drawtext` captions, and `loudnorm` pass 2 with the measured values
     (`linear=true`) for a precise −14 LUFS master. Output is H.264/AAC
     48 kHz with `+faststart`.
4. The dashboard polls `GET /api/status/[jobId]` (stage + percent), then
   previews the result inline (`GET /api/download/[jobId]` supports HTTP
   Range requests) or downloads it (`?download=1`).

Measured on test renders: output programme loudness lands within
±0.05 LU of the −14 LUFS target, including after jump cuts.

## Podcast → Clips

A second mode (`/podcast`) turns one long episode into a set of short
vertical clips, entirely on-device:

1. **Transcribe** the whole upload with local Whisper (`lib/transcribe`,
   word-level timestamps, nothing leaves the machine).
2. **Select** highlight moments heuristically (`lib/highlights`): candidate
   windows are built on sentence boundaries and scored by hook signals — a
   question opener, emphasis/curiosity words, story markers, natural
   speaking pace, and a duration near the short-form sweet spot — then the
   top non-overlapping windows are chosen.
3. **Fan out** (`lib/podcast`): each highlight is cut from the source and run
   through the same brand pipeline as a single clip (1080×1920 crop, grade,
   −14 LUFS) with captions auto-built from that segment's transcript words —
   no manual caption entry.

The dashboard shows the source episode expanding into titled, downloadable
clips. Selection is rule-based (the free, no-API-key choice); swap
`lib/highlights/select.js` for an LLM call if you want smarter picks.

## Brand profiles

Each archetype lives at `config/brands/<id>.json`, validated and clamped by
`utils/styleParser.js` before use (bad configs report *all* problems at once):

- `adrian_per` — warm cinematic grade, dark shadows, bold yellow centered titles, caption fade
- `jefferson_fisher` — clean documentary contrast, zero clutter, strict jump cuts on breaths
- `chaad_hewitt` — classic newsroom contrast, bold white uppercase lower-third on a box
- `william_scott` — high-clarity exposure, sharp jump cuts, minimal captions
- `race_against_cancer` — bright hopeful campaign look for Instagram: bold white
  uppercase statements on the brand's raspberry-pink box (`#E23D7C`, sampled
  from campaign footage), energetic breath-cut pacing

## Style Guide Override

The UI takes the style guide as a **file upload** (`.md`/`.txt`, ≤ 512 KB)
sent as the `styleGuideFile` form part; API callers can still pass the raw
text in the `styleOverride` string field (the file wins if both are sent).
Either way the content is parsed in two layers (`utils/styleParser.js`):

1. **Keyword rules** — brand vocabulary mapped to parameter deltas, e.g.
   "moody" → contrast boost + gamma crush + vignette; "minimalist" → no
   text animation, no caption box; "jump cuts" → breath cuts on, high
   sensitivity; a bare `#RRGGBB` anywhere sets the caption color.
2. **Explicit directives** — `key: value` lines that set parameters
   outright and always beat keywords:

   ```
   - contrast: 1.3
   - caption color: #FF5500
   - position: lower-third
   - cut sensitivity: high
   ```

Every applied rule is returned by `/api/process` and shown per-job in the
dashboard, so it's clear what an override actually changed. Results are
re-clamped after parsing — no override can push a filter outside safe range.

## Captions

The caption engine (`utils/captionCues.js` + `lib/ffmpeg/filters.js`) accepts:

- **SRT** — pasted subtitles become timed cues (auto-detected);
- **JSON cue arrays** — `captionCuesJson` form field:
  `[{ "text": "...", "start": 0, "end": 2.4 }]`;
- **plain text** — one paragraph is held for the whole clip; multiple
  lines are spread evenly across it.

Cue text is passed to drawtext via per-cue `textfile=`, so quotes, colons,
and `%` in user text can't break (or escape) the filter graph. Long cues
word-wrap to the frame width; styling (font, size, color, outline, box,
lower-third/center/top position, uppercase, fade) comes from the brand
profile.

## Known limitations

- Job state is an in-process registry (`lib/jobs/jobStore.js`, a
  `globalThis` Map) — it resets on server restart and doesn't scale across
  instances. Swap in Redis/Postgres for production.
- No auth or per-user isolation; uploads/outputs live on local disk
  (`/uploads`, `/output`) rather than object storage.
- Renders run in-process in the Next.js server; heavy parallel loads want
  a real worker queue.
