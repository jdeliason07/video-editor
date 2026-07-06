/**
 * Brand validation + style parsing layer.
 *
 * Responsibilities:
 *   1. Load & validate the JSON brand archetype profiles in /config/brands.
 *   2. Parse free-form "Brand Style Guide Override" text pasted into the UI
 *      and translate brand vocabulary ("moody", "minimalist", "lower third")
 *      into explicit, clamped programmatic variables the FFmpeg pipeline
 *      can consume directly.
 *
 * Everything here is plain CommonJS so it can be shared by API route
 * handlers (TS) and the ffmpeg pipeline (JS) without a build step.
 */

const fs = require("fs");
const path = require("path");

const BRANDS_DIR = path.join(process.cwd(), "config", "brands");

/** Neutral fallback profile. Every loaded/parsed profile is deep-merged onto this. */
const DEFAULT_PROFILE = {
  id: "default",
  name: "Default",
  archetype: "Neutral",
  description: "Neutral baseline grade with no stylistic bias.",
  keywords: [],
  video: {
    contrast: 1.0,
    saturation: 1.0,
    brightness: 0.0,
    gamma: 1.0,
    sharpen: 0.0,
    vignette: false,
    colorBalance: {
      shadows: { r: 0, g: 0, b: 0 },
      midtones: { r: 0, g: 0, b: 0 },
      highlights: { r: 0, g: 0, b: 0 },
    },
  },
  audio: {
    targetLUFS: -14,
    truePeak: -1.5,
    loudnessRange: 11,
  },
  captions: {
    fontFile: "public/fonts/Inter-SemiBold.ttf",
    fontWeight: "semibold",
    fontSize: 56,
    primaryColor: "#FFFFFF",
    secondaryColor: "#FFFFFF",
    position: "center",
    backgroundBox: false,
    animation: "none",
    uppercase: false,
  },
  editing: {
    jumpCutOnBreaths: false,
    cutSensitivity: "medium",
    minShotSeconds: 1.5,
  },
};

/** Value ranges the pipeline can safely build FFmpeg filter strings from. */
const CLAMPS = {
  "video.contrast": [0.4, 2.2],
  "video.saturation": [0.0, 2.5],
  "video.brightness": [-0.3, 0.3],
  "video.gamma": [0.4, 2.2],
  "video.sharpen": [0.0, 1.5],
  "video.colorBalance.shadows.r": [-1, 1],
  "video.colorBalance.shadows.g": [-1, 1],
  "video.colorBalance.shadows.b": [-1, 1],
  "video.colorBalance.midtones.r": [-1, 1],
  "video.colorBalance.midtones.g": [-1, 1],
  "video.colorBalance.midtones.b": [-1, 1],
  "video.colorBalance.highlights.r": [-1, 1],
  "video.colorBalance.highlights.g": [-1, 1],
  "video.colorBalance.highlights.b": [-1, 1],
  "audio.targetLUFS": [-24, -8],
  "audio.truePeak": [-6, -0.5],
  "audio.loudnessRange": [3, 20],
  "captions.fontSize": [24, 120],
  "editing.minShotSeconds": [0.3, 6],
};

const VALID_POSITIONS = new Set(["center", "lower-third", "top"]);
const VALID_SENSITIVITY = new Set(["low", "medium", "high"]);
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merge `patch` onto `base`, returning a new object (never mutates inputs). */
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    const baseVal = out[key];
    out[key] = isPlainObject(patchVal) && isPlainObject(baseVal) ? deepMerge(baseVal, patchVal) : patchVal;
  }
  return out;
}

function getPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp every numeric field with a known safe range, and validate enums.
 * Throws a descriptive error if a required structural field is missing or
 * the wrong type (this is the "brand validation layer").
 */
function normalizeProfile(rawProfile) {
  if (!isPlainObject(rawProfile)) {
    throw new Error("Brand profile must be a JSON object");
  }

  const merged = deepMerge(DEFAULT_PROFILE, rawProfile);

  for (const dotted of Object.keys(CLAMPS)) {
    const [min, max] = CLAMPS[dotted];
    const current = getPath(merged, dotted);
    if (typeof current !== "number" || Number.isNaN(current)) {
      throw new Error(`Brand profile field "${dotted}" must be a number`);
    }
    setPath(merged, dotted, clamp(current, min, max));
  }

  if (!VALID_POSITIONS.has(merged.captions.position)) {
    throw new Error(
      `captions.position must be one of ${[...VALID_POSITIONS].join(", ")}, got "${merged.captions.position}"`
    );
  }
  if (!VALID_SENSITIVITY.has(merged.editing.cutSensitivity)) {
    throw new Error(
      `editing.cutSensitivity must be one of ${[...VALID_SENSITIVITY].join(", ")}, got "${merged.editing.cutSensitivity}"`
    );
  }
  for (const colorField of ["primaryColor", "secondaryColor"]) {
    if (!HEX_COLOR_RE.test(merged.captions[colorField])) {
      throw new Error(`captions.${colorField} must be a hex color, got "${merged.captions[colorField]}"`);
    }
  }
  if (typeof merged.captions.backgroundBox !== "boolean") {
    throw new Error("captions.backgroundBox must be a boolean");
  }
  if (typeof merged.editing.jumpCutOnBreaths !== "boolean") {
    throw new Error("editing.jumpCutOnBreaths must be a boolean");
  }

  return merged;
}

function listBrandIds() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs
    .readdirSync(BRANDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/** Load, validate, and normalize every brand profile in /config/brands. */
function listBrandProfiles() {
  return listBrandIds().map((id) => loadBrandProfile(id));
}

/** Load a single brand profile by id (filename without extension). */
function loadBrandProfile(id) {
  const safeId = path.basename(String(id));
  const file = path.join(BRANDS_DIR, `${safeId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown brand profile: "${id}"`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    throw new Error(`Brand profile "${id}" is not valid JSON: ${err.message}`);
  }
  return normalizeProfile(raw);
}

/**
 * Keyword -> programmatic-variable translation rules.
 * Each rule scans the override text for a pattern and, on match, mutates a
 * working draft of the config plus records a human-readable explanation of
 * what it changed (surfaced back to the UI for transparency).
 */
const KEYWORD_RULES = [
  {
    name: "moody / dark shadows",
    test: /\b(moody|dark shadows|noir|brooding)\b/i,
    apply: (cfg) => {
      cfg.video.contrast += 0.18;
      cfg.video.gamma -= 0.1;
      cfg.video.vignette = true;
    },
    explain: "contrast boosted, gamma crushed toward shadow, vignette enabled",
  },
  {
    name: "warm tone",
    test: /\bwarm(th)?\b/i,
    apply: (cfg) => {
      cfg.video.colorBalance.shadows.r += 0.06;
      cfg.video.colorBalance.shadows.b -= 0.08;
      cfg.video.colorBalance.midtones.r += 0.03;
    },
    explain: "shadows/midtones pushed toward orange, away from blue",
  },
  {
    name: "cool tone",
    test: /\b(cool|cold)\b/i,
    apply: (cfg) => {
      cfg.video.colorBalance.shadows.b += 0.08;
      cfg.video.colorBalance.shadows.r -= 0.05;
    },
    explain: "shadows pushed toward blue, away from orange",
  },
  {
    name: "cinematic / filmic",
    test: /\b(cinematic|filmic|film-like)\b/i,
    apply: (cfg) => {
      cfg.video.vignette = true;
      cfg.video.sharpen += 0.1;
      cfg.editing.minShotSeconds = Math.max(cfg.editing.minShotSeconds, 2.0);
    },
    explain: "vignette enabled, slight sharpen, longer minimum shot length",
  },
  {
    name: "high contrast",
    test: /\bhigh[\s-]?contrast\b/i,
    apply: (cfg) => {
      cfg.video.contrast += 0.2;
    },
    explain: "contrast boosted",
  },
  {
    name: "low contrast / flat",
    test: /\b(low[\s-]?contrast|flat( look)?)\b/i,
    apply: (cfg) => {
      cfg.video.contrast -= 0.15;
    },
    explain: "contrast reduced",
  },
  {
    name: "vibrant / vivid",
    test: /\b(vibrant|vivid|punchy colors?)\b/i,
    apply: (cfg) => {
      cfg.video.saturation += 0.2;
    },
    explain: "saturation boosted",
  },
  {
    name: "desaturated / muted",
    test: /\b(desaturat\w*|muted( tones)?)\b/i,
    apply: (cfg) => {
      cfg.video.saturation -= 0.2;
    },
    explain: "saturation reduced",
  },
  {
    name: "minimalist / zero clutter",
    test: /\b(minimalis[tm]|zero clutter|no clutter|declutter\w*)\b/i,
    apply: (cfg) => {
      cfg.captions.animation = "none";
      cfg.captions.backgroundBox = false;
    },
    explain: "text animations disabled, no caption background box",
  },
  {
    name: "clean / simple",
    test: /\b(clean|simple)( look| style| aesthetic)?\b/i,
    apply: (cfg) => {
      cfg.captions.animation = "none";
    },
    explain: "text animations disabled",
  },
  {
    name: "bold text",
    test: /\bbold\b/i,
    apply: (cfg) => {
      cfg.captions.fontWeight = "bold";
      cfg.captions.fontSize += 8;
    },
    explain: "caption weight set to bold, font size increased",
  },
  {
    name: "crisp / sharp / high clarity",
    test: /\b(crisp|sharp(?!\s+cuts?)|high clarity)\b/i,
    apply: (cfg) => {
      cfg.video.sharpen += 0.25;
    },
    explain: "sharpen filter strengthened",
  },
  {
    name: "newsroom / documentary / broadcast",
    test: /\b(newsroom|documentary|broadcast)\b/i,
    apply: (cfg) => {
      cfg.video.contrast += 0.1;
      cfg.video.sharpen += 0.15;
    },
    explain: "contrast and sharpen increased for a broadcast look",
  },
  {
    name: "jump cuts / sharp cuts / fast cuts",
    test: /\b(jump[\s-]?cuts?|sharp cuts?|fast cuts?)\b/i,
    apply: (cfg) => {
      cfg.editing.jumpCutOnBreaths = true;
      cfg.editing.cutSensitivity = "high";
      cfg.editing.minShotSeconds = Math.min(cfg.editing.minShotSeconds, 1.2);
    },
    explain: "jump-cut-on-breath editing enabled, cut sensitivity set to high",
  },
  {
    name: "slow cuts / long takes",
    test: /\b(slow cuts?|long takes?)\b/i,
    apply: (cfg) => {
      cfg.editing.jumpCutOnBreaths = false;
      cfg.editing.cutSensitivity = "low";
      cfg.editing.minShotSeconds = Math.max(cfg.editing.minShotSeconds, 3);
    },
    explain: "jump cuts disabled, cut sensitivity set to low",
  },
  {
    name: "lower third",
    test: /\blower[\s-]?third\b/i,
    apply: (cfg) => {
      cfg.captions.position = "lower-third";
      cfg.captions.backgroundBox = true;
    },
    explain: "captions moved to lower-third with background box",
  },
  {
    name: "centered captions",
    test: /\bcenter(ed)?\b/i,
    apply: (cfg) => {
      cfg.captions.position = "center";
    },
    explain: "captions centered",
  },
  {
    name: "uppercase",
    test: /\b(uppercase|all[\s-]?caps)\b/i,
    apply: (cfg) => {
      cfg.captions.uppercase = true;
    },
    explain: "captions rendered in uppercase",
  },
  {
    name: "lowercase",
    test: /\blowercase\b/i,
    apply: (cfg) => {
      cfg.captions.uppercase = false;
    },
    explain: "captions rendered in original casing",
  },
  {
    name: "yellow accent",
    test: /\byellow\b/i,
    apply: (cfg) => {
      cfg.captions.primaryColor = "#F5C518";
    },
    explain: 'primary caption color set to "#F5C518"',
  },
  {
    name: "white subtitles",
    test: /\bwhite (subtitles?|text|captions?)\b/i,
    apply: (cfg) => {
      cfg.captions.secondaryColor = "#FFFFFF";
    },
    explain: 'secondary caption color set to "#FFFFFF"',
  },
  {
    name: "quiet / dialogue-heavy",
    test: /\b(quiet|podcast|dialogue[\s-]?heavy)\b/i,
    apply: (cfg) => {
      cfg.audio.loudnessRange -= 2;
    },
    explain: "loudness range tightened for dialogue consistency",
  },
  {
    name: "loud / energetic",
    test: /\b(loud|energetic|high energy)\b/i,
    apply: (cfg) => {
      cfg.audio.loudnessRange += 2;
    },
    explain: "loudness range widened for energetic dynamics",
  },
];

/** Explicit #hex codes in the override text always win over keyword rules. */
function applyExplicitHexCodes(cfg, text, applied) {
  const matches = text.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g);
  if (!matches || matches.length === 0) return;
  cfg.captions.primaryColor = matches[0].toUpperCase();
  applied.push({ name: "explicit hex color (primary)", explain: `primary caption color set to "${cfg.captions.primaryColor}"` });
  if (matches[1]) {
    cfg.captions.secondaryColor = matches[1].toUpperCase();
    applied.push({ name: "explicit hex color (secondary)", explain: `secondary caption color set to "${cfg.captions.secondaryColor}"` });
  }
}

/**
 * Parse free-form "Brand Style Guide Override" text and merge the resulting
 * programmatic deltas onto a base brand profile.
 *
 * @param {string} overrideText - arbitrary markdown/plain text from the UI textarea
 * @param {object} baseProfile - a normalized profile (from loadBrandProfile) to start from
 * @returns {{ profile: object, appliedRules: {name: string, explain: string}[] }}
 */
function parseStyleOverride(overrideText, baseProfile) {
  const draft = deepMerge(DEFAULT_PROFILE, baseProfile || DEFAULT_PROFILE);
  const appliedRules = [];

  const text = typeof overrideText === "string" ? overrideText : "";
  if (text.trim().length === 0) {
    return { profile: normalizeProfile(draft), appliedRules };
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(text)) {
      rule.apply(draft);
      appliedRules.push({ name: rule.name, explain: rule.explain });
    }
  }
  applyExplicitHexCodes(draft, text, appliedRules);

  return { profile: normalizeProfile(draft), appliedRules };
}

module.exports = {
  DEFAULT_PROFILE,
  listBrandIds,
  listBrandProfiles,
  loadBrandProfile,
  normalizeProfile,
  parseStyleOverride,
  KEYWORD_RULES,
};
