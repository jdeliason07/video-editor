/**
 * "Jump cuts on breaths": detect dead-air silences with ffmpeg's
 * silencedetect, decide which are long enough to read as breath pauses,
 * and build select/aselect filters that remove them from both streams
 * while keeping picture and sound in sync.
 */

const { ffmpeg } = require("./binaries");

// How long a silence must be before it reads as a "breath pause" worth
// cutting, per editing.cutSensitivity. Lower threshold = more aggressive.
const SILENCE_THRESHOLD_BY_SENSITIVITY = {
  high: 0.35,
  medium: 0.6,
  low: 1.2,
};

const SILENCE_NOISE_FLOOR_DB = "-30dB";

/** Breathing room retained on each side of a removed silence so cuts don't clip word edges. */
const CUT_PADDING_SECONDS = 0.06;

/**
 * Run a fast, audio-only ffmpeg pass with `silencedetect` and parse the
 * silence_start/silence_end pairs out of stderr.
 * @returns {Promise<{start: number, end: number}[]>}
 */
function detectSilences(inputPath, minSilenceDuration = 0.25) {
  return new Promise((resolve, reject) => {
    const silences = [];
    let pendingStart = null;

    ffmpeg(inputPath)
      .outputOptions(["-vn", "-map", "0:a:0"])
      .audioFilters(`silencedetect=noise=${SILENCE_NOISE_FLOOR_DB}:d=${minSilenceDuration}`)
      .format("null")
      .on("stderr", (line) => {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (startMatch) pendingStart = parseFloat(startMatch[1]);
        if (endMatch && pendingStart !== null) {
          silences.push({ start: pendingStart, end: parseFloat(endMatch[1]) });
          pendingStart = null;
        }
      })
      .on("end", () => resolve(silences))
      .on("error", (err) => reject(err))
      .save("-");
  });
}

/**
 * Decide which silences actually get cut:
 *   - only silences longer than the sensitivity threshold (shorter ones read
 *     as natural pauses, not dead air);
 *   - padded inward so speech onsets aren't clipped;
 *   - skipped when removing them would leave a shot shorter than
 *     editing.minShotSeconds (strict jump-cut *spacing*, not just cutting).
 *
 * @returns {{start: number, end: number}[]} cut windows, sorted, on the source timeline
 */
function planCuts(silences, durationSeconds, editingConfig) {
  const threshold =
    SILENCE_THRESHOLD_BY_SENSITIVITY[editingConfig.cutSensitivity] ?? SILENCE_THRESHOLD_BY_SENSITIVITY.medium;
  const minShot = editingConfig.minShotSeconds ?? 0;

  const candidates = silences
    .filter((s) => s.end - s.start >= threshold)
    .map((s) => ({
      start: Math.max(0, s.start + CUT_PADDING_SECONDS),
      end: Math.min(durationSeconds, s.end - CUT_PADDING_SECONDS),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const cuts = [];
  let lastKeepStart = 0;
  for (const cut of candidates) {
    // The shot this cut would close off must satisfy the minimum spacing.
    if (cut.start - lastKeepStart < minShot) continue;
    cuts.push(cut);
    lastKeepStart = cut.end;
  }
  return cuts;
}

/** Turn a cuts list into the "keep" segments that remain after removing them. */
function computeKeepSegments(cuts, durationSeconds) {
  const keep = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start > cursor) {
      keep.push({ start: cursor, end: cut.start });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < durationSeconds) {
    keep.push({ start: cursor, end: durationSeconds });
  }

  // Guard against degenerate input (e.g. the whole clip is "silent"): never
  // return an empty edit, just fall back to the untouched full clip.
  return keep.length > 0 ? keep : [{ start: 0, end: durationSeconds }];
}

/**
 * Map a timestamp on the original timeline to where it lands on the
 * post-cut timeline, so caption cue timing stays in sync with picture after
 * jump-cut segments are removed.
 */
function remapTimestamp(t, cuts) {
  let shift = 0;
  for (const cut of cuts) {
    if (cut.end <= t) shift += cut.end - cut.start;
    else if (cut.start < t) shift += t - cut.start;
  }
  return Math.max(0, t - shift);
}

/**
 * Build the `select`/`aselect` + `setpts`/`asetpts` filter pair that removes
 * the cut windows from both the video and audio streams in one pass, driven
 * by the same keep-segment list so picture and sound stay in sync.
 */
function buildJumpCutFilters(keepSegments) {
  const condition = keepSegments
    .map((seg) => `between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})`)
    .join("+");
  return {
    videoFilter: `select='${condition}',setpts=N/FRAME_RATE/TB`,
    audioFilter: `aselect='${condition}',asetpts=N/SR/TB`,
  };
}

module.exports = {
  SILENCE_THRESHOLD_BY_SENSITIVITY,
  CUT_PADDING_SECONDS,
  detectSilences,
  planCuts,
  computeKeepSegments,
  remapTimestamp,
  buildJumpCutFilters,
};
