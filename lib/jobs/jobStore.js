/**
 * Minimal in-memory job registry for tracking video compilation state.
 *
 * This intentionally lives in a single module-level Map rather than a
 * database: the app is a local/single-process tool, and job state only
 * needs to survive for the lifetime of the Node process serving requests.
 * It does NOT survive a server restart or work across multiple server
 * instances - see README for the production-scaling note.
 */

const jobs = new Map();

const STATUSES = ["queued", "processing", "completed", "failed"];

function createJob({ id, fileName, brandId, appliedRules = [] }) {
  const job = {
    id,
    fileName,
    brandId,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    outputPath: null,
    error: null,
    appliedRules,
    jumpCutMeta: null,
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { STATUSES, createJob, updateJob, getJob, listJobs };
