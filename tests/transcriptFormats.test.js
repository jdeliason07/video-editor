const test = require("node:test");
const assert = require("node:assert/strict");
const { formatTimestamp, formatClock, toParagraphs, toTxt, toSrt, toVtt } = require("../lib/transcribe/formats");

const tx = {
  duration: 20,
  language: "en",
  segments: [
    { start: 0, end: 2.5, text: " Hello there." },
    { start: 2.6, end: 5, text: " This is a test." },
    { start: 9, end: 11.25, text: " After a pause." },
    { start: 11.3, end: 12, text: "   " },
  ],
};

test("formatTimestamp renders SRT and VTT separators with millisecond rounding", () => {
  assert.equal(formatTimestamp(0), "00:00:00,000");
  assert.equal(formatTimestamp(3725.4567), "01:02:05,457");
  assert.equal(formatTimestamp(61.5, "."), "00:01:01.500");
});

test("formatClock omits hours under an hour", () => {
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(3661), "1:01:01");
});

test("toParagraphs breaks on long pauses and drops empty segments", () => {
  const paras = toParagraphs(tx);
  assert.equal(paras.length, 2);
  assert.equal(paras[0].text, "Hello there. This is a test.");
  assert.equal(paras[1].start, 9);
});

test("toParagraphs only splits long runs at sentence ends", () => {
  const segs = [];
  for (let i = 0; i < 10; i++) segs.push({ start: i * 10, end: i * 10 + 9.5, text: i === 5 ? "and so" : "Words." });
  const paras = toParagraphs({ segments: segs }, { maxSeconds: 60 });
  // At the 60s mark the paragraph ends in the unfinished "and so" — the break
  // must wait for the next sentence end rather than cut mid-sentence.
  assert.equal(paras.length, 2);
  assert.match(paras[0].text, /and so Words\.$/);
  assert.equal(paras[1].start, 70);
  for (const p of paras.slice(0, -1)) assert.match(p.text, /\.$/);
});

test("toTxt includes clock markers", () => {
  assert.equal(toTxt(tx), "[0:00] Hello there. This is a test.\n\n[0:09] After a pause.\n");
});

test("toSrt numbers cues and skips blanks", () => {
  const srt = toSrt(tx);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nHello there\.\n/);
  assert.match(srt, /\n3\n00:00:09,000 --> 00:00:11,250\nAfter a pause\.\n$/);
  assert.doesNotMatch(srt, /\n4\n/);
});

test("toVtt has header and dot separators", () => {
  const vtt = toVtt(tx);
  assert.ok(vtt.startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello there.\n"));
});
