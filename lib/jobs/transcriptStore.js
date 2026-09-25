/**
 * In-process registry for transcription jobs. Same globalThis-singleton
 * pattern as jobStore.js (one registry per server process; resets on
 * restart — see README). The finished transcript is kept in memory
 * (a 30-minute talk is ~50 KB of JSON) and served from here.
 */

const GLOBAL_KEY = Symbol.for("vertical-video-auto-editor.transcriptJobs");

function registry() {
  if (!globalThis[GLOBAL_KEY]) globalThis[GLOBAL_KEY] = new Map();
  return globalThis[GLOBAL_KEY];
}

function createTranscriptJob({ id, fileName, model }) {
  const job = {
    id,
    fileName,
    model,
    status: "queued", // queued | extracting | transcribing | completed | failed
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    durationSeconds: null,
    language: null,
    transcript: null,
  };
  registry().set(id, job);
  return job;
}

function updateTranscriptJob(id, patch) {
  const job = registry().get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function getTranscriptJob(id) {
  return registry().get(id) || null;
}

/** Job list without the (potentially large) transcript bodies. */
function listTranscriptJobs() {
  return [...registry().values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ transcript, ...rest }) => ({ ...rest, segmentCount: transcript?.segments?.length ?? null }));
}

module.exports = { createTranscriptJob, updateTranscriptJob, getTranscriptJob, listTranscriptJobs };
