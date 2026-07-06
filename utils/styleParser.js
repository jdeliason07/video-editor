/**
 * Brand validation + style parsing layer.
 *
 * Responsibilities:
 *   1. Load & validate the JSON brand archetype profiles in /config/brands,
 *      clamping every numeric knob into a range the FFmpeg pipeline can
 *      safely build filter strings from.
 *   2. Parse free-form "Brand Style Guide Override" text pasted into the UI
 *      and translate brand vocabulary ("moody", "minimalist", "lower third")
 *      into explicit programmatic variables.
 *
 * The override grammar has two layers, applied in order:
 *   - keyword rules: fuzzy brand words ("cinematic", "zero clutter") mapped
 *     to opinionated parameter deltas;
 *   - explicit directives: `key: value` lines (e.g. "contrast: 1.3",
 *     "caption color: #FF5500", "position: lower-third") that set a
 *     parameter outright and always win over keyword rules.
 *
 * Plain CommonJS so it can be shared by Next.js route handlers (TS) and the
 * ffmpeg pipeline (JS) without a build step. Types live in styleParser.d.ts.
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
    fontFile: "public/fonts/WorkSans-Bold.ttf",
    fontSize: 56,
    primaryColor: "#FFFFFF",
    secondaryColor: "#FFFFFF",
    position: "center",
    backgroundBox: false,
    outlineWidth: 3,
    shadowOffset: 0,
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
  "captions.outlineWidth": [0, 12],
  "captions.shadowOffset": [0, 12],
  "editing.minShotSeconds": [0.3, 6],
};

const VALID_POSITIONS = new Set(["center", "lower-third", "top"]);
const VALID_SENSITIVITY = new Set(["low", "medium", "high"]);
const VALID_ANIMATIONS = new Set(["none", "fade"]);
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merge `patch` onto `base`, returning a new object (never mutates inputs). */
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
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

function expandHex(color) {
  const hex = color.slice(1);
  if (hex.length === 6) return `#${hex.toUpperCase()}`;
  return `#${hex.split("").map((c) => c + c).join("").toUpperCase()}`;
}

/**
 * Validate a profile's structure and clamp every numeric field into its safe
 * range. Collects every problem before throwing so a bad hand-written config
 * reports all of its mistakes at once, not one per run.
 */
function normalizeProfile(rawProfile) {
  if (!isPlainObject(rawProfile)) {
    throw new Error("Brand profile must be a JSON object");
  }

  const merged = deepMerge(DEFAULT_PROFILE, rawProfile);
  const problems = [];

  for (const dotted of Object.keys(CLAMPS)) {
    const [min, max] = CLAMPS[dotted];
    const current = getPath(merged, dotted);
    if (typeof current !== "number" || Number.isNaN(current)) {
      problems.push(`"${dotted}" must be a number, got ${JSON.stringify(current)}`);
    } else {
      setPath(merged, dotted, clamp(current, min, max));
    }
  }

  if (!VALID_POSITIONS.has(merged.captions.position)) {
    problems.push(`"captions.position" must be one of ${[...VALID_POSITIONS].join(", ")}, got "${merged.captions.position}"`);
  }
  if (!VALID_SENSITIVITY.has(merged.editing.cutSensitivity)) {
    problems.push(`"editing.cutSensitivity" must be one of ${[...VALID_SENSITIVITY].join(", ")}, got "${merged.editing.cutSensitivity}"`);
  }
  if (!VALID_ANIMATIONS.has(merged.captions.animation)) {
    problems.push(`"captions.animation" must be one of ${[...VALID_ANIMATIONS].join(", ")}, got "${merged.captions.animation}"`);
  }
  for (const colorField of ["primaryColor", "secondaryColor"]) {
    const value = merged.captions[colorField];
    if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
      problems.push(`"captions.${colorField}" must be a hex color like #F5C518, got ${JSON.stringify(value)}`);
    } else {
      merged.captions[colorField] = expandHex(value);
    }
  }
  for (const boolField of ["captions.backgroundBox", "captions.uppercase", "video.vignette", "editing.jumpCutOnBreaths"]) {
    if (typeof getPath(merged, boolField) !== "boolean") {
      problems.push(`"${boolField}" must be a boolean`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid brand profile "${merged.id}": ${problems.join("; ")}`);
  }
  return merged;
}

function listBrandIds() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs
    .readdirSync(BRANDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
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
 * Layer 1 — keyword rules. Each rule scans the override text and, on match,
 * nudges a working draft of the config, recording a human-readable
 * explanation that is surfaced back to the UI for transparency.
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
    explain: "shadows and midtones pushed toward orange, away from blue",
  },
  {
    name: "cool tone",
    test: /\b(cool|cold|icy)\b/i,
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
    test: /\b(low[\s-]?contrast|flat( look| profile)?)\b/i,
    apply: (cfg) => {
      cfg.video.contrast -= 0.15;
    },
    explain: "contrast reduced",
  },
  {
    name: "vibrant / vivid",
    test: /\b(vibrant|vivid|punchy)\b/i,
    apply: (cfg) => {
      cfg.video.saturation += 0.2;
    },
    explain: "saturation boosted",
  },
  {
    name: "desaturated / muted",
    test: /\b(desaturat\w*|muted|washed[\s-]?out)\b/i,
    apply: (cfg) => {
      cfg.video.saturation -= 0.2;
    },
    explain: "saturation reduced",
  },
  {
    name: "black and white",
    test: /\b(black[\s-]?and[\s-]?white|monochrome|grayscale|greyscale)\b/i,
    apply: (cfg) => {
      cfg.video.saturation = 0;
    },
    explain: "saturation removed entirely (monochrome)",
  },
  {
    name: "bright / airy",
    test: /\b(bright|airy|light and clean)\b/i,
    apply: (cfg) => {
      cfg.video.brightness += 0.04;
      cfg.video.gamma += 0.05;
    },
    explain: "brightness and gamma lifted",
  },
  {
    name: "minimalist / zero clutter",
    test: /\b(minimalis[tm]\w*|zero clutter|no clutter|declutter\w*)\b/i,
    apply: (cfg) => {
      cfg.captions.animation = "none";
      cfg.captions.backgroundBox = false;
    },
    explain: "text animations disabled, no caption background box",
  },
  {
    name: "clean / simple",
    test: /\b(clean|simple)\b/i,
    apply: (cfg) => {
      cfg.captions.animation = "none";
    },
    explain: "text animations disabled",
  },
  {
    name: "bold text",
    test: /\bbold\b/i,
    apply: (cfg) => {
      cfg.captions.fontSize += 8;
      cfg.captions.outlineWidth = Math.max(cfg.captions.outlineWidth, 4);
    },
    explain: "caption size and outline weight increased",
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
    name: "jump cuts / fast cuts",
    test: /\b(jump[\s-]?cuts?|sharp cuts?|fast cuts?|tight edit)\b/i,
    apply: (cfg) => {
      cfg.editing.jumpCutOnBreaths = true;
      cfg.editing.cutSensitivity = "high";
      cfg.editing.minShotSeconds = Math.min(cfg.editing.minShotSeconds, 1.2);
    },
    explain: "jump-cut-on-breath editing enabled, cut sensitivity set to high",
  },
  {
    name: "slow cuts / long takes",
    test: /\b(slow cuts?|long takes?|no (jump[\s-]?)?cuts)\b/i,
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
    name: "top-of-frame captions",
    test: /\b(top of (the )?frame|captions? (at|on) top)\b/i,
    apply: (cfg) => {
      cfg.captions.position = "top";
    },
    explain: "captions moved to top of frame",
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
    name: "lowercase / sentence case",
    test: /\b(lowercase|sentence case)\b/i,
    apply: (cfg) => {
      cfg.captions.uppercase = false;
    },
    explain: "captions rendered in original casing",
  },
  {
    name: "fade animation",
    test: /\bfade[\s-]?(in|ins|animation)?\b/i,
    apply: (cfg) => {
      cfg.captions.animation = "fade";
    },
    explain: "caption fade in/out enabled",
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
    name: "white captions",
    test: /\bwhite (subtitles?|text|captions?|titles?)\b/i,
    apply: (cfg) => {
      cfg.captions.primaryColor = "#FFFFFF";
    },
    explain: 'primary caption color set to "#FFFFFF"',
  },
  {
    name: "quiet / dialogue-heavy",
    test: /\b(quiet|podcast|dialogue[\s-]?heavy|talking head)\b/i,
    apply: (cfg) => {
      cfg.audio.loudnessRange -= 2;
    },
    explain: "loudness range tightened for dialogue consistency",
  },
  {
    name: "loud / energetic",
    test: /\b(energetic|high[\s-]?energy|hype)\b/i,
    apply: (cfg) => {
      cfg.audio.loudnessRange += 2;
    },
    explain: "loudness range widened for energetic dynamics",
  },
];

/**
 * Layer 2 — explicit `key: value` directives. Recognized on their own line
 * (markdown bullets/emphasis stripped), e.g.:
 *
 *   - contrast: 1.35
 *   - caption color: #FF5500
 *   - font size: 72
 *   - position: lower-third
 *
 * These set the parameter outright and always beat keyword rules.
 */
const DIRECTIVES = [
  { keys: ["contrast"], path: "video.contrast", kind: "number" },
  { keys: ["saturation"], path: "video.saturation", kind: "number" },
  { keys: ["brightness"], path: "video.brightness", kind: "number" },
  { keys: ["gamma"], path: "video.gamma", kind: "number" },
  { keys: ["sharpen", "sharpness"], path: "video.sharpen", kind: "number" },
  { keys: ["lufs", "target lufs", "loudness"], path: "audio.targetLUFS", kind: "number" },
  { keys: ["font size", "fontsize", "caption size"], path: "captions.fontSize", kind: "number" },
  { keys: ["outline", "outline width", "stroke"], path: "captions.outlineWidth", kind: "number" },
  { keys: ["caption color", "text color", "title color", "font color"], path: "captions.primaryColor", kind: "color" },
  { keys: ["accent color", "secondary color"], path: "captions.secondaryColor", kind: "color" },
  { keys: ["position", "caption position"], path: "captions.position", kind: "enum", values: VALID_POSITIONS },
  { keys: ["cut sensitivity"], path: "editing.cutSensitivity", kind: "enum", values: VALID_SENSITIVITY },
  { keys: ["min shot", "min shot seconds", "minimum shot"], path: "editing.minShotSeconds", kind: "number" },
];

function parseDirectiveLine(line) {
  // Strip markdown list markers, emphasis, and heading hashes before matching.
  const cleaned = line.replace(/^[\s>*#-]+/, "").replace(/[*_`]/g, "").trim();
  const match = cleaned.match(/^([a-zA-Z ]{2,30}?)\s*[:=]\s*(.+)$/);
  if (!match) return null;
  const key = match[1].trim().toLowerCase();
  const rawValue = match[2].trim();

  for (const directive of DIRECTIVES) {
    if (!directive.keys.includes(key)) continue;
    if (directive.kind === "number") {
      const num = parseFloat(rawValue);
      if (Number.isNaN(num)) return null;
      return { directive, value: num, display: String(num) };
    }
    if (directive.kind === "color") {
      const colorMatch = rawValue.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
      if (!colorMatch) return null;
      return { directive, value: expandHex(colorMatch[0]), display: expandHex(colorMatch[0]) };
    }
    if (directive.kind === "enum") {
      const value = rawValue.toLowerCase().replace(/\s+/g, "-");
      if (!directive.values.has(value)) return null;
      return { directive, value, display: value };
    }
  }
  return null;
}

/** Bare `#hex` codes anywhere in the text set the primary caption color. */
function applyLooseHexCodes(cfg, text, applied) {
  // Skip if an explicit color directive already ran (it recorded itself).
  if (applied.some((a) => a.name.startsWith("directive: caption color") || a.name.startsWith("directive: text color"))) return;
  const matches = text.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g);
  if (!matches || matches.length === 0) return;
  cfg.captions.primaryColor = expandHex(matches[0]);
  applied.push({
    name: "explicit hex color",
    explain: `primary caption color set to "${cfg.captions.primaryColor}"`,
  });
  if (matches[1]) {
    cfg.captions.secondaryColor = expandHex(matches[1]);
    applied.push({
      name: "explicit hex color (secondary)",
      explain: `secondary caption color set to "${cfg.captions.secondaryColor}"`,
    });
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

  for (const line of text.split(/\r?\n/)) {
    const parsed = parseDirectiveLine(line);
    if (!parsed) continue;
    setPath(draft, parsed.directive.path, parsed.value);
    appliedRules.push({
      name: `directive: ${parsed.directive.keys[0]}`,
      explain: `${parsed.directive.path} set to ${parsed.display}`,
    });
  }

  applyLooseHexCodes(draft, text, appliedRules);

  return { profile: normalizeProfile(draft), appliedRules };
}

module.exports = {
  DEFAULT_PROFILE,
  CLAMPS,
  listBrandIds,
  listBrandProfiles,
  loadBrandProfile,
  normalizeProfile,
  parseStyleOverride,
  KEYWORD_RULES,
};
