const { execFileSync } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

// The pipeline shells out to a real ffmpeg/ffprobe install (fluent-ffmpeg
// resolves both from $PATH by default). Point FFMPEG_PATH/FFPROBE_PATH at
// specific binaries if they aren't on PATH — see README "Requirements".
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

const INSTALL_HINT =
  "Install FFmpeg (Debian/Ubuntu: `apt-get install -y ffmpeg`, macOS: `brew install ffmpeg`, " +
  "Windows: `winget install ffmpeg`) or set FFMPEG_PATH / FFPROBE_PATH, then restart the server.";

let cachedStatus = null;

function binaryWorks(binary) {
  try {
    execFileSync(binary, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Non-throwing availability report for both binaries. Cached after the
 * first success (missing binaries are re-checked so an install fixes the
 * app without a restart, even though the hint suggests one to be safe).
 */
function checkBinaries() {
  if (cachedStatus && cachedStatus.ok) return cachedStatus;
  const ffmpegOk = binaryWorks(process.env.FFMPEG_PATH || "ffmpeg");
  const ffprobeOk = binaryWorks(process.env.FFPROBE_PATH || "ffprobe");
  cachedStatus = {
    ok: ffmpegOk && ffprobeOk,
    ffmpeg: ffmpegOk,
    ffprobe: ffprobeOk,
    hint: ffmpegOk && ffprobeOk ? null : INSTALL_HINT,
  };
  return cachedStatus;
}

/** Fail fast with an actionable message instead of a mid-render ENOENT. */
function assertFfmpegAvailable() {
  const status = checkBinaries();
  if (status.ok) return;
  const missing = [!status.ffmpeg && "ffmpeg", !status.ffprobe && "ffprobe"].filter(Boolean).join(" and ");
  throw new Error(`${missing} not found on this machine. ${INSTALL_HINT}`);
}

module.exports = { ffmpeg, checkBinaries, assertFfmpegAvailable };
