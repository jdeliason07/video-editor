export type BrandSummary = {
  id: string;
  name: string;
  archetype: string;
  description: string;
  keywords: string[];
};

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type AppliedRule = { name: string; explain: string };

export type Job = {
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
};
