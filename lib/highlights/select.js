/**
 * Heuristic highlight selection: turn a word-timestamped transcript into a
 * ranked set of self-contained, clip-worthy moments.
 *
 * There's no ML here (that was the free/no-API-key choice) — instead we
 * build candidate windows on sentence boundaries and score them by signals
 * that correlate with engaging short-form clips: a question or hook opener,
 * emphasis/curiosity words, story/opinion markers, a natural speaking pace,
 * and a duration near the short-form sweet spot. Then we greedily take the
 * highest-scoring non-overlapping windows.
 */

const MIN_CLIP_SECONDS = 12;
const MAX_CLIP_SECONDS = 60;
const IDEAL_CLIP_SECONDS = 30;
const MIN_GAP_SECONDS = 3; // spacing between chosen clips

// Words that tend to open or mark a compelling moment.
const HOOK_WORDS = [
  "secret", "surprise", "surprising", "important", "biggest", "worst", "best", "never", "always",
  "mistake", "truth", "honestly", "actually", "realize", "realized", "nobody", "everybody", "everyone",
  "crazy", "insane", "incredible", "amazing", "shocking", "problem", "reason", "because", "the key",
  "the thing is", "here's why", "here's the", "what if", "imagine", "the point",
];
const STORY_WORDS = ["i ", "we ", "my ", "story", "happened", "remember", "when i", "one day", "years ago"];
const FILLER_WORDS = ["um", "uh", "like", "you know", "kind of", "sort of", "i mean", "basically"];

function countOccurrences(haystack, needles) {
  let n = 0;
  for (const needle of needles) {
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      n += 1;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

/**
 * Flatten a transcript's words into sentences with timestamps. A sentence
 * ends on terminal punctuation carried in the Whisper word token ("show.").
 */
function buildSentences(transcript) {
  const words = [];
  for (const seg of transcript.segments) {
    if (seg.words && seg.words.length) {
      words.push(...seg.words);
    } else {
      // Segment without word timings: treat the whole segment as one unit.
      words.push({ word: seg.text, start: seg.start, end: seg.end });
    }
  }

  const sentences = [];
  let current = null;
  for (const w of words) {
    if (!current) current = { start: w.start, end: w.end, text: "" };
    current.text += w.word;
    current.end = w.end;
    if (/[.!?]["')\]]?\s*$/.test(w.word)) {
      current.text = current.text.trim();
      if (current.text) sentences.push(current);
      current = null;
    }
  }
  if (current && current.text.trim()) {
    current.text = current.text.trim();
    sentences.push(current);
  }
  return sentences;
}

function scoreWindow(text, durationSeconds, wordCount) {
  const lower = ` ${text.toLowerCase()} `;
  let score = 0;

  if (text.includes("?")) score += 3; // a question is a strong hook
  score += Math.min(countOccurrences(lower, HOOK_WORDS) * 1.5, 6);
  score += Math.min(countOccurrences(lower, STORY_WORDS) * 0.8, 3);
  score += Math.min(countOccurrences(lower, [" one ", " two ", " three ", " first ", " second ", " % "]) * 0.5, 2);
  score -= Math.min(countOccurrences(lower, FILLER_WORDS) * 0.4, 4);

  // Speaking pace: ~2–3.3 words/sec reads as natural, engaged speech.
  const wps = wordCount / Math.max(durationSeconds, 1);
  if (wps >= 2 && wps <= 3.3) score += 1.5;
  else if (wps < 1) score -= 2; // lots of dead air

  // Duration near the short-form sweet spot.
  score -= Math.abs(durationSeconds - IDEAL_CLIP_SECONDS) / 20;

  return score;
}

/** Derive a short, human title from a clip's text (prefers a question). */
function deriveTitle(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const question = sentences.find((s) => s.endsWith("?"));
  let title = (question || sentences[0] || text).replace(/^[-–—\s]+/, "");
  if (title.length > 64) title = `${title.slice(0, 61).trimEnd()}…`;
  return title;
}

/**
 * Group a clip's words into short caption phrases (3–5 words, or on
 * punctuation), timestamped relative to the clip start — ready for the
 * existing drawtext caption engine.
 */
function buildCaptionCues(words, clipStart) {
  const cues = [];
  let phrase = [];
  let phraseStart = null;

  const flush = (end) => {
    if (!phrase.length) return;
    cues.push({
      text: phrase.join(" ").replace(/\s+([.,!?])/g, "$1").trim(),
      start: Math.max(0, phraseStart - clipStart),
      end: Math.max(0, end - clipStart),
    });
    phrase = [];
    phraseStart = null;
  };

  for (const w of words) {
    if (phraseStart === null) phraseStart = w.start;
    phrase.push(w.word.trim());
    const endsClause = /[.,!?]["')\]]?\s*$/.test(w.word);
    if (phrase.length >= 5 || endsClause) flush(w.end);
  }
  if (phrase.length) flush(words[words.length - 1].end);
  return cues;
}

function collectWords(transcript, start, end) {
  const words = [];
  for (const seg of transcript.segments) {
    for (const w of seg.words || []) {
      if (w.start >= start - 0.01 && w.end <= end + 0.01) words.push(w);
    }
  }
  return words;
}

/**
 * Select up to `maxClips` highlight clips from a transcript.
 *
 * @param {object} transcript - from lib/transcribe
 * @param {object} [options]
 * @param {number} [options.maxClips] - hard cap (default scales with duration)
 * @returns {Array<{start:number,end:number,title:string,score:number,text:string,captionCues:Array}>}
 */
function selectHighlights(transcript, options = {}) {
  const sentences = buildSentences(transcript);
  if (sentences.length === 0) return [];

  const duration = transcript.duration || sentences[sentences.length - 1].end;
  const maxClips = options.maxClips ?? Math.max(1, Math.min(12, Math.round(duration / 180)));

  // Candidate windows: every run of consecutive sentences whose total length
  // lands inside [MIN_CLIP, MAX_CLIP]. Each window is self-contained because
  // it begins and ends on sentence boundaries.
  const candidates = [];
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i; j < sentences.length; j++) {
      const start = sentences[i].start;
      const end = sentences[j].end;
      const dur = end - start;
      if (dur < MIN_CLIP_SECONDS) continue;
      if (dur > MAX_CLIP_SECONDS) break;
      const text = sentences.slice(i, j + 1).map((s) => s.text).join(" ");
      const wordCount = text.split(/\s+/).length;
      candidates.push({ start, end, text, score: scoreWindow(text, dur, wordCount) });
    }
  }
  if (candidates.length === 0) return [];

  // Greedy non-overlapping selection, highest score first.
  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const cand of candidates) {
    if (chosen.length >= maxClips) break;
    const overlaps = chosen.some(
      (c) => cand.start < c.end + MIN_GAP_SECONDS && cand.end > c.start - MIN_GAP_SECONDS
    );
    if (overlaps) continue;
    chosen.push(cand);
  }

  return chosen
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      start: Number(c.start.toFixed(3)),
      end: Number(c.end.toFixed(3)),
      title: deriveTitle(c.text),
      score: Number(c.score.toFixed(2)),
      text: c.text,
      captionCues: buildCaptionCues(collectWords(transcript, c.start, c.end), c.start),
    }));
}

module.exports = { selectHighlights, buildSentences, buildCaptionCues, deriveTitle, MIN_CLIP_SECONDS, MAX_CLIP_SECONDS };
