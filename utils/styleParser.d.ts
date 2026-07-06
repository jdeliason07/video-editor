export interface ColorChannel {
  r: number;
  g: number;
  b: number;
}

export interface BrandProfile {
  id: string;
  name: string;
  archetype: string;
  description: string;
  keywords: string[];
  video: {
    contrast: number;
    saturation: number;
    brightness: number;
    gamma: number;
    sharpen: number;
    vignette: boolean;
    colorBalance: {
      shadows: ColorChannel;
      midtones: ColorChannel;
      highlights: ColorChannel;
    };
  };
  audio: {
    targetLUFS: number;
    truePeak: number;
    loudnessRange: number;
  };
  captions: {
    fontFile: string;
    fontSize: number;
    primaryColor: string;
    secondaryColor: string;
    position: "center" | "lower-third" | "top";
    backgroundBox: boolean;
    outlineWidth: number;
    shadowOffset: number;
    animation: "none" | "fade";
    uppercase: boolean;
  };
  editing: {
    jumpCutOnBreaths: boolean;
    cutSensitivity: "low" | "medium" | "high";
    minShotSeconds: number;
  };
}

export interface AppliedRule {
  name: string;
  explain: string;
}

export const DEFAULT_PROFILE: BrandProfile;
export const CLAMPS: Record<string, [number, number]>;
export function listBrandIds(): string[];
export function listBrandProfiles(): BrandProfile[];
export function loadBrandProfile(id: string): BrandProfile;
export function normalizeProfile(rawProfile: unknown): BrandProfile;
export function parseStyleOverride(
  overrideText: string,
  baseProfile: BrandProfile
): { profile: BrandProfile; appliedRules: AppliedRule[] };
export const KEYWORD_RULES: Array<{ name: string; test: RegExp; apply: (cfg: BrandProfile) => void; explain: string }>;
