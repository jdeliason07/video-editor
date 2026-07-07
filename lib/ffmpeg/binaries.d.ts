import type ffmpeg from "fluent-ffmpeg";

export interface BinaryStatus {
  ok: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
  hint: string | null;
}

export { ffmpeg };
export function checkBinaries(): BinaryStatus;
export function assertFfmpegAvailable(): void;
