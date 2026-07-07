/**
 * In-process registry for podcast → clips jobs. Same globalThis-singleton
 * pattern as jobStore.js (one registry per server process; resets on
 * restart — see README). A podcast job owns an ordered list of clip
 * sub-results as they are rendered.
 */

const GLOBAL_KEY = Symbol.for("vertical-video-auto-editor.podcastJobs");

function registry() {
  if (!globalThis[GLOBAL_KEY]) globalThis[GLOBAL_KEY] = new Map();
  return globalThis[GLOBAL_KEY];
}

function createPodcastJob({ id, fileName, brandId }) {
  const job = {
    id,
    fileName,
    brandId,
    status: "queued", // queued | transcribing | selecting | rendering | completed | failed
    stage: null,
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    durationSeconds: null,
    clipsFound: null,
    clips: [], // { index, title, start, end, status, outputPath, error }
  };
  registry().set(id, job);
  return job;
}

function updatePodcastJob(id, patch) {
  const job = registry().get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function setClips(id, clips) {
  const job = registry().get(id);
  if (!job) return null;
  job.clips = clips;
  job.updatedAt = Date.now();
  return job;
}

function updateClip(id, index, patch) {
  const job = registry().get(id);
  if (!job) return null;
  const clip = job.clips.find((c) => c.index === index);
  if (clip) Object.assign(clip, patch);
  job.updatedAt = Date.now();
  return job;
}

function getPodcastJob(id) {
  return registry().get(id) || null;
}

function listPodcastJobs() {
  return [...registry().values()].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  createPodcastJob,
  updatePodcastJob,
  setClips,
  updateClip,
  getPodcastJob,
  listPodcastJobs,
};
