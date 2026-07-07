/**
 * Podcast → clips orchestrator.
 *
 *   1. transcribe the whole upload (local Whisper)          [ 2–40% ]
 *   2. select highlight moments from the transcript          [40–44% ]
 *   3. for each highlight: cut the sub-clip from the source,
 *      then run it through the existing brand pipeline
 *      (1080×1920 crop, grade, −14 LUFS, auto-captions)      [44–100%]
 *
 * Step 3 reuses lib/ffmpeg/pipeline.processVideo unchanged — a highlight
 * clip is just a short video that gets the same brand treatment as a normal
 * upload, with caption cues built from that segment's transcript words.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ffmpeg } = require("../ffmpeg/binaries");
const { processVideo } = require("../ffmpeg/pipeline");
const { transcribe } = require("../transcribe");
const { selectHighlights } = require("../highlights/select");

/** Cut [start,end] from the source, re-encoding for frame-accurate edges. */
function extractSubclip(inputPath, start, end, outPath) {
  const duration = Math.max(0.1, end - start);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-ss", start.toFixed(3)])
      .outputOptions(["-t", duration.toFixed(3), "-preset", "veryfast", "-crf", "18"])
      .videoCodec("libx264")
      .audioCodec("aac")
      .on("error", reject)
      .on("end", () => resolve(outPath))
      .save(outPath);
  });
}

/**
 * @param {object} args
 * @param {string} args.inputPath
 * @param {string} args.outputDir - where finished clip mp4s are written
 * @param {string} args.jobId - used to name clip files uniquely
 * @param {object} args.profile - normalized brand profile
 * @param {object} [args.options] - { maxClips }
 * @param {object} [args.hooks] - lifecycle callbacks for the job store:
 *   onStage(stage, progress), onTranscribed(duration), onClipsPlanned(clips),
 *   onClipStart(index), onClipDone(index, result), onClipError(index, message)
 */
async function processPodcast({ inputPath, outputDir, jobId, profile, options = {}, hooks = {} }) {
  const emit = (name, ...a) => hooks[name] && hooks[name](...a);

  // --- 1. transcribe ----------------------------------------------------
  emit("onStage", "transcribing", 2);
  const transcript = await transcribe(inputPath, (frac) => {
    emit("onStage", "transcribing", Math.round(2 + frac * 38));
  });
  emit("onTranscribed", transcript.duration);

  // --- 2. select highlights ---------------------------------------------
  emit("onStage", "selecting", 42);
  const highlights = selectHighlights(transcript, options);
  if (highlights.length === 0) {
    throw new Error("No clippable moments were found in this recording (too short or no clear speech).");
  }
  const planned = highlights.map((h, index) => ({
    index,
    title: h.title,
    start: h.start,
    end: h.end,
    status: "queued",
    outputPath: null,
    error: null,
  }));
  emit("onClipsPlanned", planned);

  // --- 3. render each highlight through the brand pipeline --------------
  fs.mkdirSync(outputDir, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "veditor-podcast-"));
  const renderStart = 44;
  const renderSpan = 100 - renderStart;

  // Highlights are already the edit — don't also jump-cut inside them.
  const clipProfile = {
    ...profile,
    editing: { ...profile.editing, jumpCutOnBreaths: false },
  };

  try {
    for (let index = 0; index < highlights.length; index++) {
      const highlight = highlights[index];
      emit("onClipStart", index);
      const clipBase = renderStart + (renderSpan * index) / highlights.length;
      const clipSpan = renderSpan / highlights.length;

      const subclipPath = path.join(workDir, `sub-${index}.mp4`);
      const outputPath = path.join(outputDir, `${jobId}-clip-${index}.mp4`);

      try {
        await extractSubclip(inputPath, highlight.start, highlight.end, subclipPath);
        const result = await processVideo({
          inputPath: subclipPath,
          outputPath,
          profile: clipProfile,
          captionCues: highlight.captionCues,
          onProgress: ({ percent }) => emit("onStage", "rendering", Math.round(clipBase + (percent / 100) * clipSpan)),
        });
        emit("onClipDone", index, { outputPath, ...result });
      } catch (err) {
        emit("onClipError", index, err.message);
      } finally {
        fs.rmSync(subclipPath, { force: true });
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  emit("onStage", "rendering", 100);
  return { duration: transcript.duration, clipsFound: highlights.length };
}

module.exports = { processPodcast, extractSubclip };
