/**
 * Minimal in-process job registry for tracking video compilation state.
 *
 * The Map is stored on globalThis because Next.js bundles each API route
 * separately — plain module-level state can be instantiated once per route
 * bundle, which would make /api/status blind to jobs created by
 * /api/process. A globalThis singleton guarantees one registry per server
 * process.
 *
 * It intentionally is NOT a database: this is a local/single-process tool,
 * so job state only needs to outlive the request that started it. It does
 * not survive a server restart or scale across instances — see README.
 */

const GLOBAL_KEY = Symbol.for("vertical-video-auto-editor.jobs");

function registry() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new Map();
  }
  return globalThis[GLOBAL_KEY];
}

function createJob({ id, fileName, brandId, appliedRules = [] }) {
  const job = {
    id,
    fileName,
    brandId,
    status: "queued",
    stage: null,
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    outputPath: null,
    error: null,
    appliedRules,
    result: null,
  };
  registry().set(id, job);
  return job;
}

function updateJob(id, patch) {
  const job = registry().get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function getJob(id) {
  return registry().get(id) || null;
}

function listJobs() {
  return [...registry().values()].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { createJob, updateJob, getJob, listJobs };
