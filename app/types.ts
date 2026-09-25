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

export type PodcastClip = {
  index: number;
  title: string;
  start: number;
  end: number;
  status: "queued" | "rendering" | "completed" | "failed";
  outputPath: string | null;
  error: string | null;
};

export type PodcastJob = {
  id: string;
  fileName: string;
  brandId: string;
  status: string; // queued | transcribing | selecting | rendering | completed | failed
  stage: string | null;
  progress: number;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  durationSeconds: number | null;
  clipsFound: number | null;
  clips: PodcastClip[];
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

export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscriptJob = {
  id: string;
  fileName: string;
  model: string;
  status: "queued" | "extracting" | "transcribing" | "completed" | "failed";
  progress: number;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  durationSeconds: number | null;
  language: string | null;
  transcript: { duration: number; language: string; segments: TranscriptSegment[] } | null;
};

export type TranscriptJobSummary = Omit<TranscriptJob, "transcript"> & { segmentCount: number | null };
