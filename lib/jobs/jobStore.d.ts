import type { AppliedRule } from "@/utils/styleParser";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  fileName: string;
  brandId: string;
  status: JobStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  outputPath: string | null;
  error: string | null;
  appliedRules: AppliedRule[];
  jumpCutMeta: { cutsRemoved: number } | null;
}

export const STATUSES: JobStatus[];
export function createJob(args: { id: string; fileName: string; brandId: string; appliedRules?: AppliedRule[] }): Job;
export function updateJob(id: string, patch: Partial<Job>): Job | null;
export function getJob(id: string): Job | null;
export function listJobs(): Job[];
