import type { BrandProfile } from "@/utils/styleParser";

export interface CaptionCue {
  text: string;
  start: number;
  end: number;
}

export interface PipelineProgress {
  stage: "analyzing" | "measuring" | "rendering";
  percent: number;
}

export interface ProcessVideoArgs {
  inputPath: string;
  outputPath: string;
  profile: BrandProfile;
  captionCues?: CaptionCue[];
  onProgress?: (progress: PipelineProgress) => void;
}

export interface ProcessVideoResult {
  outputPath: string;
  inputDuration: number;
  outputDuration: number;
  loudness: {
    target: number;
    twoPass: boolean;
    measuredInput: number | null;
  };
  jumpCutMeta: { cutsRemoved: number; keepSegments: { start: number; end: number }[] } | null;
}

export function processVideo(args: ProcessVideoArgs): Promise<ProcessVideoResult>;
