const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCaptionInput, resolveCueTimes, looksLikeSrt } = require("../utils/captionCues");

test("JSON cue arrays are validated and normalized", () => {
  const cues = parseCaptionInput(JSON.stringify([{ text: "Hi", start: 1 }, { text: "There", start: 4, end: 6 }]), null);
  assert.deepEqual(cues, [
    { text: "Hi", start: 1, end: 4 },
    { text: "There", start: 4, end: 6 },
  ]);
});

test("invalid JSON cues throw with the offending index", () => {
  assert.throws(() => parseCaptionInput(JSON.stringify([{ start: 0 }]), null), /Caption cue 0/);
  assert.throws(() => parseCaptionInput(JSON.stringify([{ text: "x", start: 5, end: 2 }]), null), /end.*<= start/);
});

test("SRT input is detected and parsed with millisecond timing", () => {
  const srt = [
    "1",
    "00:00:01,200 --> 00:00:03,500",
    "First line",
    "of the cue",
    "",
    "2",
    "00:00:04,000 --> 00:00:06,250",
    "Second cue",
  ].join("\n");
  assert.equal(looksLikeSrt(srt), true);
  const cues = parseCaptionInput(null, srt);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { text: "First line of the cue", start: 1.2, end: 3.5 });
  assert.deepEqual(cues[1], { text: "Second cue", start: 4, end: 6.25 });
});

test("single plain-text paragraph is held for the whole clip", () => {
  const cues = resolveCueTimes(parseCaptionInput(null, "Hello world"), 12);
  assert.deepEqual(cues, [{ text: "Hello world", start: 0, end: 12 }]);
});

test("multiple plain-text lines spread evenly across the duration", () => {
  const cues = resolveCueTimes(parseCaptionInput(null, "One\nTwo\nThree"), 9);
  assert.deepEqual(cues, [
    { text: "One", start: 0, end: 3 },
    { text: "Two", start: 3, end: 6 },
    { text: "Three", start: 6, end: 9 },
  ]);
});

test("resolveCueTimes clips cues to the real duration", () => {
  const cues = resolveCueTimes([{ text: "tail", start: 5, end: 100 }, { text: "gone", start: 60, end: 70 }], 10);
  assert.deepEqual(cues, [{ text: "tail", start: 5, end: 10 }]);
});

test("empty input produces no cues", () => {
  assert.deepEqual(parseCaptionInput(null, null), []);
  assert.deepEqual(parseCaptionInput("", "   "), []);
});
