/**
 * FFmpeg filter-string construction: vertical framing, brand color grade,
 * and the drawtext caption engine.
 *
 * Caption text is passed to drawtext via `textfile=` (one temp file per cue)
 * rather than inline `text=`, so arbitrary user text — quotes, colons,
 * percent signs, emoji — can never break the filter graph or escape it.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;

/** Horizontal margin kept clear on each side of caption text, in px. */
const CAPTION_SIDE_MARGIN = 72;
/** Seconds a caption takes to fade in/out when animation is "fade". */
const FADE_SECONDS = 0.35;

// System fallbacks for when a brand's bundled font is missing (drawtext on
// many ffmpeg builds has no fontconfig, so a concrete file path is required).
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
    `No usable caption font found. Add "${captionsConfig.fontFile}" to the project or install a system font (DejaVu/Liberation).`
  );
}

/** drawtext wants 0xRRGGBB; brand configs use #RRGGBB. */
function hexToFfmpegColor(hex) {
  return `0x${hex.slice(1)}`;
}

let drawtextHelpCache = null;

/**
 * Whether the installed ffmpeg's drawtext filter supports an option.
 * Newer options (e.g. `text_align`, added in 6.1) must be omitted on older
 * builds — passing them makes the whole render fail. Unknown/failed lookup
 * is treated as unsupported so we degrade gracefully.
 */
function drawtextSupports(option) {
  if (drawtextHelpCache === null) {
    try {
      drawtextHelpCache = execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-h", "filter=drawtext"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      drawtextHelpCache = "";
    }
  }
  return new RegExp(`^\\s+${option}\\s`, "m").test(drawtextHelpCache);
}

/**
 * Greedy word-wrap for drawtext (which never wraps on its own). Line width
 * is estimated from the font size; long captions become balanced multi-line
 * blocks instead of bleeding off the 1080px frame.
 */
function wrapCaptionText(text, fontSize) {
  const usableWidth = VERTICAL_WIDTH - CAPTION_SIDE_MARGIN * 2;
  // ~0.56em average advance width for a bold sans at these sizes.
  const maxChars = Math.max(8, Math.floor(usableWidth / (fontSize * 0.56)));

  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join("\n");
}

/**
 * Build the `scale,crop` pair that fits any source aspect ratio into a
 * 1080x1920 vertical frame.
 *
 * Deliberately one plain string literal: Turbopack's production
 * constant-folding (Next 16.2) mis-folds the equivalent template-literal
 * concatenation and silently drops ":force_original_aspect_ratio=increase,"
 * from the bundle, which breaks every render in production builds.
 */
function buildFrameFilter() {
  return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";
}

/** Color grade: brightness/contrast/saturation/gamma + 3-way color balance + optional sharpen/vignette. */
function buildGradeFilters(video) {
  const filters = [];

  filters.push(
    `eq=contrast=${video.contrast.toFixed(3)}:brightness=${video.brightness.toFixed(3)}:` +
      `saturation=${video.saturation.toFixed(3)}:gamma=${video.gamma.toFixed(3)}`
  );

  const cb = video.colorBalance;
  const hasBalance = ["shadows", "midtones", "highlights"].some(
    (zone) => cb[zone].r !== 0 || cb[zone].g !== 0 || cb[zone].b !== 0
  );
  if (hasBalance) {
    filters.push(
      `colorbalance=rs=${cb.shadows.r.toFixed(3)}:gs=${cb.shadows.g.toFixed(3)}:bs=${cb.shadows.b.toFixed(3)}:` +
        `rm=${cb.midtones.r.toFixed(3)}:gm=${cb.midtones.g.toFixed(3)}:bm=${cb.midtones.b.toFixed(3)}:` +
        `rh=${cb.highlights.r.toFixed(3)}:gh=${cb.highlights.g.toFixed(3)}:bh=${cb.highlights.b.toFixed(3)}`
    );
  }

  if (video.sharpen > 0.01) {
    // Map the 0-1.5 brand "sharpen" knob onto unsharp's luma amount (0-3 typical range).
    filters.push(`unsharp=5:5:${(video.sharpen * 2).toFixed(2)}:5:5:0.0`);
  }

  if (video.vignette) {
    filters.push("vignette=PI/5");
  }

  return filters;
}

function captionYExpression(position) {
  switch (position) {
    case "lower-third":
      return "h-(text_h+260)";
    case "top":
      return "160";
    case "center":
    default:
      return "(h-text_h)/2";
  }
}

/** Per-cue opacity expression implementing a fade in/out inside the cue window. */
function fadeAlphaExpression(start, end) {
  const F = FADE_SECONDS;
  const s = start.toFixed(3);
  const e = end.toFixed(3);
  return `if(lt(t,${s}+${F}),(t-${s})/${F},if(gt(t,${e}-${F}),(${e}-t)/${F},1))`;
}

/**
 * Build one drawtext filter per caption cue, each gated to its [start, end)
 * window with `enable=between(t,...)` so all cues render in one encode pass.
 * Writes each cue's wrapped text to `<workDir>/cue-<i>.txt` for `textfile=`.
 *
 * @param {{text: string, start: number, end: number}[]} cues
 * @param {object} captionsConfig - brand profile `.captions` block
 * @param {string} workDir - directory for the per-cue text files (caller cleans up)
 */
function buildCaptionFilters(cues, captionsConfig, workDir) {
  if (!cues || cues.length === 0) return [];

  const fontFile = resolveFontFile(captionsConfig);
  const y = captionYExpression(captionsConfig.position);
  const color = hexToFfmpegColor(captionsConfig.primaryColor);

  const styleArgs = [];
  if (captionsConfig.backgroundBox) {
    const boxColor = hexToFfmpegColor(captionsConfig.boxColor || "#000000");
    const boxOpacity = (captionsConfig.boxOpacity ?? 0.55).toFixed(2);
    styleArgs.push("box=1", `boxcolor=${boxColor}@${boxOpacity}`, "boxborderw=26");
  }
  if (captionsConfig.outlineWidth > 0) {
    styleArgs.push(`borderw=${Math.round(captionsConfig.outlineWidth)}`, "bordercolor=black@0.85");
  }
  if (captionsConfig.shadowOffset > 0) {
    const o = Math.round(captionsConfig.shadowOffset);
    styleArgs.push(`shadowx=${o}`, `shadowy=${o}`, "shadowcolor=black@0.6");
  }

  fs.mkdirSync(workDir, { recursive: true });

  return cues.map((cue, i) => {
    const rawText = captionsConfig.uppercase ? cue.text.toUpperCase() : cue.text;
    const textFile = path.join(workDir, `cue-${i}.txt`);
    fs.writeFileSync(textFile, wrapCaptionText(rawText, captionsConfig.fontSize), "utf-8");

    const args = [
      `fontfile='${fontFile}'`,
      `textfile='${textFile}'`,
      `fontsize=${captionsConfig.fontSize}`,
      `fontcolor=${color}`,
      // text_align only exists on ffmpeg >= 6.1; older builds fall back to
      // left-aligned lines inside the (still horizontally centered) block.
      ...(drawtextSupports("text_align") ? ["text_align=center"] : []),
      "line_spacing=14",
      "x=(w-text_w)/2",
      `y=${y}`,
      ...styleArgs,
      `enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'`,
    ];
    if (captionsConfig.animation === "fade" && cue.end - cue.start > FADE_SECONDS * 2) {
      args.push(`alpha='${fadeAlphaExpression(cue.start, cue.end)}'`);
    }
    return `drawtext=${args.join(":")}`;
  });
}

/** Loudness normalization filter for a single dynamic pass, or a precise linear second pass when `measured` is provided. */
function buildLoudnormFilter(audioConfig, measured) {
  const base = `loudnorm=I=${audioConfig.targetLUFS}:TP=${audioConfig.truePeak}:LRA=${audioConfig.loudnessRange}`;
  if (!measured) return base;
  return (
    `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
    `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:` +
    `offset=${measured.target_offset}:linear=true`
  );
}

module.exports = {
  VERTICAL_WIDTH,
  VERTICAL_HEIGHT,
  FADE_SECONDS,
  resolveFontFile,
  hexToFfmpegColor,
  wrapCaptionText,
  buildFrameFilter,
  buildGradeFilters,
  buildCaptionFilters,
  buildLoudnormFilter,
};
