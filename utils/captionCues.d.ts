export interface CaptionCue {
  text: string;
  start: number;
  end: number;
  evenSlot?: number;
}

export const WHOLE_CLIP: number;
export function parseCaptionInput(cuesJson: string | null, captionText: string | null): CaptionCue[];
export function resolveCueTimes(cues: CaptionCue[], durationSeconds: number): CaptionCue[];
export function parseSrt(text: string): CaptionCue[];
export function looksLikeSrt(text: string): boolean;
