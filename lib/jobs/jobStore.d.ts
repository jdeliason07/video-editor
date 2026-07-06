import type { AppliedRule } from "@/utils/styleParser";
import type { ProcessVideoResult } from "@/lib/ffmpeg/pipeline";

export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type JobStage = "analyzing" | "measuring" | "rendering" | null;

export interface Job {
  id: string;
  fileName: string;
  brandId: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  createdAt: number;
  updatedAt: number;
  outputPath: string | null;
  error: string | null;
  appliedRules: AppliedRule[];
  result: ProcessVideoResult | null;
}

export function createJob(args: { id: string; fileName: string; brandId: string; appliedRules?: AppliedRule[] }): Job;
export function updateJob(id: string, patch: Partial<Job>): Job | null;
export function getJob(id: string): Job | null;
export function listJobs(): Job[];
