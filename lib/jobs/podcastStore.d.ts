import type { PodcastJob, PodcastClip } from "@/app/types";

export function createPodcastJob(args: { id: string; fileName: string; brandId: string }): PodcastJob;
export function updatePodcastJob(id: string, patch: Partial<PodcastJob>): PodcastJob | null;
export function setClips(id: string, clips: PodcastClip[]): PodcastJob | null;
export function updateClip(id: string, index: number, patch: Partial<PodcastClip>): PodcastJob | null;
export function getPodcastJob(id: string): PodcastJob | null;
export function listPodcastJobs(): PodcastJob[];
