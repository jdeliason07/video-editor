const fs = require("fs");
const path = require("path");

const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;

// Common system font locations to fall back to when a brand hasn't shipped
// its own font file under /public/fonts (drawtext requires a real font file
// on ffmpeg-static builds, which have no fontconfig support).
const FALLBACK_FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
];

function resolveFontFile(captionsConfig) {
  const projectFont = path.join(process.cwd(), captionsConfig.fontFile);
  if (fs.existsSync(projectFont)) return projectFont;

  const fallback = FALLBACK_FONT_CANDIDATES.find((p) => fs.existsSync(p));
  if (fallback) return fallback;

  throw new Error(
    `No usable font file found. Add "${captionsConfig.fontFile}" to the project or install a system font (DejaVu/Liberation).`
  );
}

/** Escape a caption string for safe use inside an ffmpeg drawtext filter. */
function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ");
}

/** Build the `scale,crop` pair that fits any source aspect ratio into a 1080x1920 vertical frame. */
function buildFrameFilter() {
  return (
    `scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1`
  );
}

/** Color grade: brightness/contrast/saturation/gamma + 3-way color balance + optional sharpen/vignette. */
function buildGradeFilters(video) {
  const filters = [];

  filters.push(
    `eq=contrast=${video.contrast.toFixed(3)}:brightness=${video.brightness.toFixed(3)}:` +
      `saturation=${video.saturation.toFixed(3)}:gamma=${video.gamma.toFixed(3)}`
  );

  const cb = video.colorBalance;
  filters.push(
    `colorbalance=rs=${cb.shadows.r.toFixed(3)}:gs=${cb.shadows.g.toFixed(3)}:bs=${cb.shadows.b.toFixed(3)}:` +
      `rm=${cb.midtones.r.toFixed(3)}:gm=${cb.midtones.g.toFixed(3)}:bm=${cb.midtones.b.toFixed(3)}:` +
      `rh=${cb.highlights.r.toFixed(3)}:gh=${cb.highlights.g.toFixed(3)}:bh=${cb.highlights.b.toFixed(3)}`
  );

  if (video.sharpen > 0.01) {
    // Map the 0-1.5 brand "sharpen" knob onto unsharp's luma amount (0-3 typical range).
    const amount = (video.sharpen * 2).toFixed(2);
    filters.push(`unsharp=5:5:${amount}:5:5:0.0`);
  }

  if (video.vignette) {
    filters.push("vignette=PI/5");
  }

  return filters;
}

function captionYExpression(position, textHeightVar = "text_h") {
  switch (position) {
    case "lower-third":
      return `h-(${textHeightVar}+220)`;
    case "top":
      return "140";
    case "center":
    default:
      return `(h-${textHeightVar})/2`;
  }
}

/**
 * Build one drawtext filter per caption cue, each gated to its [start, end)
 * window with FFmpeg's `enable=between(t,...)` expression so cues appear and
 * disappear at the right timestamps in a single encoding pass.
 *
 * @param {{text: string, start: number, end: number}[]} cues
 * @param {object} captionsConfig - brand profile `.captions` block
 */
function buildCaptionFilters(cues, captionsConfig) {
  if (!cues || cues.length === 0) return [];

  const fontFile = resolveFontFile(captionsConfig);
  const y = captionYExpression(captionsConfig.position);
  const boxArgs = captionsConfig.backgroundBox ? ":box=1:boxcolor=black@0.55:boxborderw=24" : "";

  return cues.map((cue) => {
    const rawText = captionsConfig.uppercase ? cue.text.toUpperCase() : cue.text;
    const text = escapeDrawtext(rawText);
    return (
      `drawtext=fontfile='${fontFile}':text='${text}':` +
      `fontsize=${captionsConfig.fontSize}:fontcolor=${captionsConfig.primaryColor}:` +
      `x=(w-text_w)/2:y=${y}${boxArgs}:` +
      `enable='between(t,${cue.start},${cue.end})'`
    );
  });
}

/** Single-pass EBU R128 loudness normalization targeting the brand's LUFS/true-peak/LRA. */
function buildAudioFilter(audioConfig) {
  return `loudnorm=I=${audioConfig.targetLUFS}:TP=${audioConfig.truePeak}:LRA=${audioConfig.loudnessRange}`;
}

/** Compose the complete video filter chain (frame + grade + captions) as a single comma-joined string. */
function buildVideoFilterChain(profile, cues) {
  return [buildFrameFilter(), ...buildGradeFilters(profile.video), ...buildCaptionFilters(cues, profile.captions)].join(",");
}

module.exports = {
  VERTICAL_WIDTH,
  VERTICAL_HEIGHT,
  resolveFontFile,
  escapeDrawtext,
  buildFrameFilter,
  buildGradeFilters,
  buildCaptionFilters,
  buildAudioFilter,
  buildVideoFilterChain,
};
