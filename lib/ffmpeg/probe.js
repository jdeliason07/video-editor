const { ffmpeg } = require("./binaries");

/** Thin promise wrapper around ffprobe: duration + stream presence. */
function probeMedia(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err);
      const videoStream = data.streams.find((s) => s.codec_type === "video");
      const audioStream = data.streams.find((s) => s.codec_type === "audio");
      resolve({
        duration: parseFloat(data.format.duration) || 0,
        hasVideo: Boolean(videoStream),
        hasAudio: Boolean(audioStream),
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
      });
    });
  });
}

module.exports = { probeMedia };
