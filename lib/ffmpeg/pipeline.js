const fs = require("fs");
const path = require("path");
const { ffmpeg } = require("./binaries");
const { probeMedia } = require("./probe");
const { buildFrameFilter, buildGradeFilters, buildCaptionFilters, buildAudioFilter, buildVideoFilterChain } = require("./filters");
const { detectSilences, filterSilencesToCuts, computeKeepSegments, remapTimestamp, buildJumpCutFilters } = require("./silenceCuts");

/**
 * Run the full brand-aware edit: vertical crop, color grade, optional
 * jump-cut-on-breaths trimming, caption overlay, and -14 LUFS audio
 * normalization, in a single ffmpeg encode pass.
 *
 * @param {object} args
 * @param {string} args.inputPath - source .mp4/.mov on disk
 * @param {string} args.outputPath - where the rendered vertical video is written
 * @param {object} args.profile - normalized brand profile (see utils/styleParser.js)
 * @param {{text: string, start: number, end: number}[]} [args.captionCues] - transcript/caption cues on the ORIGINAL timeline
 * @param {(progress: {percent?: number, timemark?: string}) => void} [args.onProgress]
 */
async function processVideo({ inputPath, outputPath, profile, captionCues = [], onProgress }) {
  const media = await probeMedia(inputPath);
  if (!media.hasVideo) {
    throw new Error("Input file has no video stream");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let videoFilterChain;
  let audioFilterChain;
  let jumpCutMeta = null;

  if (profile.editing.jumpCutOnBreaths && media.hasAudio) {
    const silences = await detectSilences(inputPath, 0.25);
    const cuts = filterSilencesToCuts(silences, profile.editing.cutSensitivity);

    if (cuts.length > 0) {
      const keepSegments = computeKeepSegments(cuts, media.duration);
      const jumpCut = buildJumpCutFilters(keepSegments);
      const remappedCues = captionCues.map((cue) => ({
        text: cue.text,
        start: remapTimestamp(cue.start, cuts),
        end: remapTimestamp(cue.end, cuts),
      }));

      const gradeAndCaptions = [
        buildFrameFilter(),
        ...buildGradeFilters(profile.video),
        ...buildCaptionFilters(remappedCues, profile.captions),
      ].join(",");

      videoFilterChain = `${jumpCut.videoFilter},${gradeAndCaptions}`;
      audioFilterChain = `${jumpCut.audioFilter},${buildAudioFilter(profile.audio)}`;
      jumpCutMeta = { cutsRemoved: cuts.length, keepSegments };
    }
  }

  if (!videoFilterChain) {
    videoFilterChain = buildVideoFilterChain(profile, captionCues);
    audioFilterChain = buildAudioFilter(profile.audio);
  }

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .outputOptions(["-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-map_metadata", "-1"])
      .audioCodec("aac")
      .audioBitrate("192k")
      .videoFilters(videoFilterChain)
      .audioFilters(audioFilterChain)
      .on("progress", (p) => onProgress && onProgress(p))
      .on("error", (err) => reject(err))
      .on("end", () => resolve())
      .save(outputPath);
  });

  return { outputPath, duration: media.duration, jumpCutMeta };
}

module.exports = { processVideo };
