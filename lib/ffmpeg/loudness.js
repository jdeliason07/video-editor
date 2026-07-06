/**
 * Two-pass EBU R128 loudness normalization support.
 *
 * loudnorm in a single pass adjusts gain dynamically and only lands *near*
 * the target. For a precise -14 LUFS master, ffmpeg's documented approach is
 * two passes: measure the programme loudness first (print_format=json), then
 * feed the measured values back into loudnorm with linear=true so the second
 * pass applies one exact linear gain offset.
 */

const { ffmpeg } = require("./binaries");

const MEASURED_FIELDS = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];

/**
 * Analysis pass: run loudnorm in measurement mode over the (optionally
 * pre-cut) audio and parse the JSON stats block it prints to stderr.
 *
 * @param {string} inputPath
 * @param {object} audioConfig - brand profile `.audio` block
 * @param {string} [preFilter] - audio filter to apply before measuring
 *   (e.g. the jump-cut aselect chain, so we measure the audio that will
 *   actually be in the final render)
 * @returns {Promise<object|null>} measured values, or null if unusable
 *   (e.g. an all-silent track) so the caller can fall back to one pass.
 */
function measureLoudness(inputPath, audioConfig, preFilter) {
  return new Promise((resolve, reject) => {
    const stderrLines = [];
    const measureFilter = `loudnorm=I=${audioConfig.targetLUFS}:TP=${audioConfig.truePeak}:LRA=${audioConfig.loudnessRange}:print_format=json`;
    const audioFilter = preFilter ? `${preFilter},${measureFilter}` : measureFilter;

    ffmpeg(inputPath)
      .outputOptions(["-vn", "-map", "0:a:0"])
      .audioFilters(audioFilter)
      .format("null")
      .on("stderr", (line) => stderrLines.push(line))
      .on("end", () => resolve(parseLoudnormJson(stderrLines.join("\n"))))
      .on("error", (err) => reject(err))
      .save("-");
  });
}

/** Extract the last loudnorm JSON stats block from ffmpeg stderr output. */
function parseLoudnormJson(stderrText) {
  const jsonBlocks = stderrText.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!jsonBlocks || jsonBlocks.length === 0) return null;

  let stats;
  try {
    stats = JSON.parse(jsonBlocks[jsonBlocks.length - 1]);
  } catch {
    return null;
  }

  const measured = {};
  for (const field of MEASURED_FIELDS) {
    const value = parseFloat(stats[field]);
    if (Number.isNaN(value) || !Number.isFinite(value)) return null; // -inf => silent/unusable track
    measured[field] = value;
  }
  return measured;
}

module.exports = { measureLoudness, parseLoudnormJson };
