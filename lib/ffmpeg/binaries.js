const { execFileSync } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

// The pipeline shells out to a real ffmpeg/ffprobe install (fluent-ffmpeg
// resolves both from $PATH by default). Point FFMPEG_PATH/FFPROBE_PATH at
// specific binaries if they aren't on PATH — see README "Requirements".
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

let availabilityChecked = false;

/** Fail fast with an actionable message instead of a mid-render ENOENT. */
function assertFfmpegAvailable() {
  if (availabilityChecked) return;
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    execFileSync(binary, ["-version"], { stdio: "ignore" });
    availabilityChecked = true;
  } catch {
    throw new Error(
      `ffmpeg binary not found ("${binary}"). Install it (apt-get install ffmpeg / brew install ffmpeg) ` +
        "or set FFMPEG_PATH and FFPROBE_PATH to point at your binaries."
    );
  }
}

module.exports = { ffmpeg, assertFfmpegAvailable };
