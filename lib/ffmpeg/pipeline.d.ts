import type { BrandProfile } from "@/utils/styleParser";

export interface CaptionCue {
  text: string;
  start: number;
  end: number;
}

export interface ProcessVideoArgs {
  inputPath: string;
  outputPath: string;
  profile: BrandProfile;
  captionCues?: CaptionCue[];
  onProgress?: (progress: { percent?: number; timemark?: string }) => void;
}

export interface ProcessVideoResult {
  outputPath: string;
  duration: number;
  jumpCutMeta: { cutsRemoved: number } | null;
}

export function processVideo(args: ProcessVideoArgs): Promise<ProcessVideoResult>;
