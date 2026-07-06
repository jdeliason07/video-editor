const { ffmpeg } = require("./binaries");

// How long a silence has to be before it reads as a "breath pause" worth
// cutting, per editing.cutSensitivity. Lower threshold = more aggressive cuts.
const SILENCE_THRESHOLD_BY_SENSITIVITY = {
  high: 0.35,
  medium: 0.6,
  low: 1.2,
};

const SILENCE_NOISE_FLOOR_DB = "-30dB";

/**
 * Run a fast, audio-only ffmpeg pass with `silencedetect` and parse the
 * silence_start/silence_end pairs out of stderr.
 * @returns {Promise<{start: number, end: number}[]>}
 */
function detectSilences(inputPath, minSilenceDuration = 0.3) {
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
 * Filter raw silence windows down to the ones long enough to read as a
 * "breath pause" worth cutting, per editing.cutSensitivity. Silences shorter
 * than the threshold are left untouched (natural pauses, not dead air).
 */
function filterSilencesToCuts(silences, cutSensitivity) {
  const threshold = SILENCE_THRESHOLD_BY_SENSITIVITY[cutSensitivity] ?? SILENCE_THRESHOLD_BY_SENSITIVITY.medium;
  return silences.filter((s) => s.end - s.start >= threshold).sort((a, b) => a.start - b.start);
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
  const condition = keepSegments.map((seg) => `between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})`).join("+");
  return {
    videoFilter: `select='${condition}',setpts=N/FRAME_RATE/TB`,
    audioFilter: `aselect='${condition}',asetpts=N/SR/TB`,
  };
}

module.exports = {
  SILENCE_THRESHOLD_BY_SENSITIVITY,
  detectSilences,
  filterSilencesToCuts,
  computeKeepSegments,
  remapTimestamp,
  buildJumpCutFilters,
};
