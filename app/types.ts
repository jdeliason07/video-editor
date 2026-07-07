export type BrandSummary = {
  id: string;
  name: string;
  archetype: string;
  description: string;
  keywords: string[];
  style: {
    captionColor: string;
    accentColor: string;
    captionPosition: "center" | "lower-third" | "top";
    backgroundBox: boolean;
    boxColor: string;
    boxOpacity: number;
    uppercase: boolean;
    contrast: number;
    saturation: number;
    vignette: boolean;
    jumpCuts: boolean;
  };
};

export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type JobStage = "analyzing" | "measuring" | "rendering" | null;

export type AppliedRule = { name: string; explain: string };

export type Job = {
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
  result: {
    inputDuration: number;
    outputDuration: number;
    loudness: { target: number; twoPass: boolean; measuredInput: number | null };
    jumpCutMeta: { cutsRemoved: number } | null;
  } | null;
};
