const ffmpeg = require("fluent-ffmpeg");

// The pipeline shells out to a real ffmpeg/ffprobe install (fluent-ffmpeg
// resolves both from $PATH by default). Point FFMPEG_PATH/FFPROBE_PATH at a
// specific binary if it isn't on PATH - see README "Requirements" section
// for install instructions (e.g. `apt-get install ffmpeg`, `brew install ffmpeg`).
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

module.exports = { ffmpeg };
