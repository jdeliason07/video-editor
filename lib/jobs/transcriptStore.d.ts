import type { TranscriptJob, TranscriptJobSummary } from "@/app/types";

export function createTranscriptJob(args: { id: string; fileName: string; model: string }): TranscriptJob;
export function updateTranscriptJob(id: string, patch: Partial<TranscriptJob>): TranscriptJob | null;
export function getTranscriptJob(id: string): TranscriptJob | null;
export function listTranscriptJobs(): TranscriptJobSummary[];
