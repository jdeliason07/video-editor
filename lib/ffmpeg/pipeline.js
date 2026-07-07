/**
 * The brand-aware edit pipeline. For each submitted clip it runs:
 *
 *   1. probe            — duration/stream sanity check
 *   2. silence analysis — only when the brand edits with jump cuts
 *   3. loudness measure — optional loudnorm pass 1 (two-pass mode only)
 *   4. render           — one encode applying vertical crop, color grade,
 *                         jump cuts, captions, and loudness normalization
 *                         in a single ffmpeg invocation
 *
 * Speed: by default we use single-pass (dynamic) loudnorm, which still
 * targets the brand's LUFS but skips the extra full audio-decode pass —
 * meaningfully faster on small cloud instances. Set TWO_PASS_LOUDNESS=1 to
 * re-enable the precise linear two-pass master.
 *
 * Progress is reported as { stage, percent } with percent computed against
 * the *output* duration (fluent-ffmpeg's own percent is unreliable once
 * select filters change the timeline).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { ffmpeg, assertFfmpegAvailable } = require("./binaries");
const { probeMedia } = require("./probe");
const { buildFrameFilter, buildGradeFilters, buildCaptionFilters, buildLoudnormFilter } = require("./filters");
const { detectSilences, planCuts, computeKeepSegments, remapTimestamp, buildJumpCutFilters } = require("./silenceCuts");
const { measureLoudness } = require("./loudness");

const TWO_PASS_LOUDNESS = process.env.TWO_PASS_LOUDNESS === "1";

// x264 preset — trades encode speed for file size at equal quality. "faster"
// is a good balance for short-form clips on modest CPUs; override with
// X264_PRESET (e.g. "veryfast", "superfast", "ultrafast") to go quicker.
const X264_PRESET = process.env.X264_PRESET || "faster";

// Stage boundaries for the overall percent estimate. Rendering owns the bulk
// since it's the only stage that touches every frame.
const STAGE_SPANS_TWO_PASS = {
  analyzing: [0, 8],
  measuring: [8, 20],
  rendering: [20, 100],
};
const STAGE_SPANS_ONE_PASS = {
  analyzing: [0, 6],
  rendering: [6, 100],
};

function timemarkToSeconds(timemark) {
  const m = String(timemark).match(/(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4] || 0}`);
}

/**
 * @param {object} args
 * @param {string} args.inputPath - source .mp4/.mov on disk
 * @param {string} args.outputPath - where the rendered vertical video is written
 * @param {object} args.profile - normalized brand profile (see utils/styleParser.js)
 * @param {{text: string, start: number, end: number}[]} [args.captionCues] - cues on the SOURCE timeline
 * @param {(progress: {stage: string, percent: number}) => void} [args.onProgress]
 */
async function processVideo({ inputPath, outputPath, profile, captionCues = [], onProgress }) {
  assertFfmpegAvailable();

  const stageSpans = TWO_PASS_LOUDNESS ? STAGE_SPANS_TWO_PASS : STAGE_SPANS_ONE_PASS;
  const report = (stage, stageFraction) => {
    if (!onProgress || !stageSpans[stage]) return;
    const [lo, hi] = stageSpans[stage];
    const bounded = Math.max(0, Math.min(1, stageFraction));
    onProgress({ stage, percent: Math.round(lo + (hi - lo) * bounded) });
  };

  report("analyzing", 0);
  const media = await probeMedia(inputPath);
  if (!media.hasVideo) {
    throw new Error("Input file has no video stream");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "veditor-captions-"));

  try {
    // --- Stage: jump-cut analysis -----------------------------------------
    let cuts = [];
    if (profile.editing.jumpCutOnBreaths && media.hasAudio) {
      const silences = await detectSilences(inputPath);
      cuts = planCuts(silences, media.duration, profile.editing);
    }
    report("analyzing", 1);

    const keepSegments = computeKeepSegments(cuts, media.duration);
    const outputDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const jumpCut = cuts.length > 0 ? buildJumpCutFilters(keepSegments) : null;
    const renderCues =
      cuts.length > 0
        ? captionCues
            .map((cue) => ({
              text: cue.text,
              start: remapTimestamp(cue.start, cuts),
              end: remapTimestamp(cue.end, cuts),
            }))
            .filter((cue) => cue.end - cue.start > 0.1)
        : captionCues;

    // --- Stage: loudness measurement (two-pass mode only) -----------------
    let measured = null;
    if (media.hasAudio && TWO_PASS_LOUDNESS) {
      report("measuring", 0);
      try {
        measured = await measureLoudness(inputPath, profile.audio, jumpCut ? jumpCut.audioFilter : undefined);
      } catch {
        measured = null; // fall back to single-pass dynamic loudnorm
      }
      report("measuring", 1);
    }

    // --- Stage: render -----------------------------------------------------
    const videoChain = [
      ...(jumpCut ? [jumpCut.videoFilter] : []),
      buildFrameFilter(),
      ...buildGradeFilters(profile.video),
      ...buildCaptionFilters(renderCues, profile.captions, workDir),
    ].join(",");

    const audioChain = [
      ...(jumpCut ? [jumpCut.audioFilter] : []),
      buildLoudnormFilter(profile.audio, measured),
    ].join(",");

    await new Promise((resolve, reject) => {
      // Keep the tail of ffmpeg's stderr so failures report the real cause
      // ("Option not found", "No such filter", ...) instead of the generic
      // "Conversion failed!".
      const stderrTail = [];
      const command = ffmpeg(inputPath)
        // Explicitly select the first video + first audio stream. iPhone .mov
        // files carry extra data/timecode/secondary-audio streams; without
        // this, ffmpeg's auto-pick can grab the wrong one and the loudnorm
        // filter ends up applied to a stream that isn't in the output.
        .outputOptions(media.hasAudio ? ["-map", "0:v:0", "-map", "0:a:0"] : ["-map", "0:v:0"])
        .videoCodec("libx264")
        .outputOptions([
          "-preset", X264_PRESET,
          "-crf", "22",
          "-pix_fmt", "yuv420p",
          "-map_metadata", "-1",
          "-movflags", "+faststart",
          "-threads", "0",
        ])
        .videoFilters(videoChain)
        .on("stderr", (line) => {
          if (/error|invalid|not found|no such|failed|unable/i.test(line)) {
            stderrTail.push(line.trim());
            if (stderrTail.length > 6) stderrTail.shift();
          }
        })
        .on("progress", (p) => {
          report("rendering", outputDuration > 0 ? timemarkToSeconds(p.timemark) / outputDuration : 0);
        })
        .on("error", (err) => {
          const detail = stderrTail.length > 0 ? ` — ${stderrTail.join(" | ")}` : "";
          reject(new Error(`${err.message}${detail}`));
        })
        .on("end", () => resolve());

      if (media.hasAudio) {
        command.audioCodec("aac").audioBitrate("192k").audioFrequency(48000).audioFilters(audioChain);
      } else {
        command.noAudio();
      }

      command.save(outputPath);
    });

    return {
      outputPath,
      inputDuration: media.duration,
      outputDuration,
      loudness: {
        target: profile.audio.targetLUFS,
        twoPass: Boolean(measured),
        measuredInput: measured ? measured.input_i : null,
      },
      jumpCutMeta: cuts.length > 0 ? { cutsRemoved: cuts.length, keepSegments } : null,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { processVideo };
