/**
 * Caption cue ingestion: normalizes every supported transcript input format
 * into a flat list of { text, start, end } cues on the source timeline.
 *
 * Supported inputs, in priority order:
 *   1. JSON cue arrays  — [{ "text": "...", "start": 0, "end": 2.4 }, ...]
 *   2. SRT subtitles    — standard "00:00:01,000 --> 00:00:03,500" blocks
 *   3. Plain text       — one overlay held for the whole clip; multiple
 *                         paragraphs are spread evenly across the duration
 *                         (real timing comes from SRT/JSON transcription hooks)
 */

const SRT_TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** Sentinel used for "hold this caption for the whole clip" before duration is known. */
const WHOLE_CLIP = Number.POSITIVE_INFINITY;

function toSeconds(h, m, s, ms) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, "0")) / 1000;
}

function looksLikeSrt(text) {
  return SRT_TIME_RE.test(text);
}

/** Parse standard SRT into cues. Tolerates missing indices and \r\n line endings. */
function parseSrt(text) {
  const cues = [];
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const timeIndex = lines.findIndex((l) => SRT_TIME_RE.test(l));
    if (timeIndex === -1) continue;
    const m = lines[timeIndex].match(SRT_TIME_RE);
    const textLines = lines.slice(timeIndex + 1);
    if (textLines.length === 0) continue;
    cues.push({
      text: textLines.join(" ").trim(),
      start: toSeconds(m[1], m[2], m[3], m[4]),
      end: toSeconds(m[5], m[6], m[7], m[8]),
    });
  }
  return cues;
}

function validateJsonCues(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error("Caption cue JSON must be an array");
  }
  return parsed.map((cue, i) => {
    if (typeof cue !== "object" || cue === null || typeof cue.text !== "string" || cue.text.trim().length === 0) {
      throw new Error(`Caption cue ${i} must be an object with a non-empty "text" string`);
    }
    const start = Number(cue.start) || 0;
    const end = cue.end != null ? Number(cue.end) : start + 3;
    if (!(end > start)) {
      throw new Error(`Caption cue ${i} has end (${end}) <= start (${start})`);
    }
    return { text: cue.text.trim(), start, end };
  });
}

/**
 * Turn plain pasted text into cues. A single paragraph is held for the whole
 * clip; multiple paragraphs/lines are spread evenly (duration resolved later
 * by resolveCueTimes once the clip length is known).
 */
function parsePlainText(text) {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [];
  if (paragraphs.length === 1) {
    return [{ text: paragraphs[0], start: 0, end: WHOLE_CLIP }];
  }
  // Evenly spaced placeholder timing; slot indices are resolved against the
  // real duration in resolveCueTimes.
  return paragraphs.map((p, i) => ({ text: p, start: i, end: i + 1, evenSlot: paragraphs.length }));
}

/**
 * Ingest whichever transcript input was provided.
 * @param {string|null} cuesJson - JSON cue array (highest priority)
 * @param {string|null} captionText - SRT or plain text
 */
function parseCaptionInput(cuesJson, captionText) {
  if (cuesJson && cuesJson.trim().length > 0) {
    return validateJsonCues(JSON.parse(cuesJson));
  }
  const text = (captionText || "").trim();
  if (text.length === 0) return [];
  if (looksLikeSrt(text)) return parseSrt(text);
  return parsePlainText(text);
}

/**
 * Resolve placeholder timing against the real clip duration: whole-clip
 * sentinels are capped, even-slot cues are distributed, and cues beyond the
 * clip are dropped.
 */
function resolveCueTimes(cues, durationSeconds) {
  return cues
    .map((cue) => {
      if (cue.evenSlot) {
        const slot = durationSeconds / cue.evenSlot;
        return { text: cue.text, start: cue.start * slot, end: cue.end * slot };
      }
      return {
        text: cue.text,
        start: cue.start,
        end: Math.min(cue.end, durationSeconds) || durationSeconds,
      };
    })
    .filter((cue) => cue.start < durationSeconds && cue.end > cue.start);
}

module.exports = { parseCaptionInput, resolveCueTimes, parseSrt, looksLikeSrt, WHOLE_CLIP };
