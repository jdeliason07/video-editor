/**
 * Node wrapper around the local faster-whisper transcriber.
 *
 * Extracts a clean 16 kHz mono WAV from the source with ffmpeg (Whisper's
 * expected input, and more robust than letting Python decode odd iPhone
 * stream layouts), then shells out to transcribe.py and parses its JSON.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { ffmpeg } = require("../ffmpeg/binaries");

const PYTHON = process.env.PYTHON_BIN || "python3";
// Resolve from the project root, not __dirname: Next.js bundles this module
// and rewrites __dirname, so a path relative to it points at the wrong place.
// The Dockerfile copies lib/transcribe into the runtime image alongside cwd.
const SCRIPT = path.join(process.cwd(), "lib", "transcribe", "transcribe.py");

/** Extract 16 kHz mono PCM WAV — the format Whisper models expect. */
function extractAudioWav(inputPath, wavPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"])
      .on("error", reject)
      .on("end", () => resolve(wavPath))
      .save(wavPath);
  });
}

/**
 * Transcribe a media file to a word-timestamped transcript.
 *
 * @param {string} inputPath - source video/audio on disk
 * @param {(fraction: number) => void} [onProgress] - 0..1 transcription progress
 * @returns {Promise<{duration:number, language:string, segments:Array<{start:number,end:number,text:string,words:Array<{word:string,start:number,end:number}>}>}>}
 */
async function transcribe(inputPath, onProgress) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "veditor-tx-"));
  const wavPath = path.join(workDir, "audio.wav");
  try {
    await extractAudioWav(inputPath, wavPath);

    return await new Promise((resolve, reject) => {
      const child = spawn(PYTHON, [SCRIPT, wavPath], { env: process.env });
      let stdout = "";
      let stderrTail = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          const m = line.match(/^PROGRESS\s+([\d.]+)/);
          if (m && onProgress) onProgress(Math.max(0, Math.min(1, parseFloat(m[1]))));
        }
        stderrTail = (stderrTail + text).slice(-800);
      });
      child.on("error", (err) => reject(new Error(`Failed to start transcriber: ${err.message}`)));
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`Transcription failed (exit ${code})${stderrTail ? `: ${stderrTail.trim()}` : ""}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(new Error(`Could not parse transcript JSON: ${err.message}`));
        }
      });
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { transcribe, extractAudioWav };
