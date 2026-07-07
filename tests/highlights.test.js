const test = require("node:test");
const assert = require("node:assert/strict");
const { selectHighlights, buildSentences, buildCaptionCues, deriveTitle } = require("../lib/highlights/select");

/** Build a transcript whose words tick one per second, from sentence strings. */
function transcriptFrom(sentences) {
  let t = 0;
  const segments = sentences.map((text) => {
    const words = text.split(/\s+/).map((w) => {
      const word = { word: (t === 0 ? "" : " ") + w, start: t, end: t + 1 };
      t += 1;
      return word;
    });
    return { start: words[0].start, end: words[words.length - 1].end, text, words };
  });
  return { duration: t, language: "en", segments };
}

test("buildSentences splits on terminal punctuation with timestamps", () => {
  const tx = transcriptFrom(["Hello there world.", "How are you?"]);
  const sentences = buildSentences(tx);
  assert.equal(sentences.length, 2);
  assert.match(sentences[0].text, /Hello there world\./);
  assert.match(sentences[1].text, /How are you\?/);
  assert.ok(sentences[1].start >= sentences[0].end - 1);
});

test("selectHighlights favors question/hook windows and returns titles", () => {
  // ~20s of filler, then a strong hooky question block, then more filler.
  const filler = "we then walked slowly to the other side of the quiet room and waited there.";
  const hook =
    "here is the most important question you can ask. what would you do if you knew you could not fail? " +
    "the answer is the biggest secret to success and honestly nobody ever tells you this truth.";
  const tx = transcriptFrom([filler, filler, hook, filler, filler]);

  const clips = selectHighlights(tx, { maxClips: 1 });
  assert.equal(clips.length, 1);
  assert.ok(clips[0].text.includes("what would you do"), "should pick the hook window");
  assert.ok(clips[0].title.length > 0 && clips[0].title.length <= 65);
  assert.ok(clips[0].end > clips[0].start);
});

test("selected clips are non-overlapping and within duration bounds", () => {
  const block = "this is a self contained thought that runs for a little while and then it finally ends here.";
  const tx = transcriptFrom(Array.from({ length: 12 }, () => block));
  const clips = selectHighlights(tx, { maxClips: 3 });
  assert.ok(clips.length >= 1 && clips.length <= 3);
  for (const c of clips) {
    const dur = c.end - c.start;
    assert.ok(dur >= 12 && dur <= 60, `duration ${dur} out of bounds`);
  }
  for (let i = 1; i < clips.length; i++) {
    assert.ok(clips[i].start >= clips[i - 1].end, "clips must not overlap");
  }
});

test("buildCaptionCues groups words into short phrases relative to clip start", () => {
  const tx = transcriptFrom(["one two three four five six seven eight."]);
  const words = tx.segments[0].words;
  const cues = buildCaptionCues(words, 0);
  assert.ok(cues.length >= 1);
  assert.ok(cues[0].start >= 0);
  assert.ok(cues.every((c) => c.end > c.start));
  // 8 words at <=5 per phrase -> at least 2 phrases
  assert.ok(cues.length >= 2);
});

test("deriveTitle prefers a question and truncates long text", () => {
  assert.equal(deriveTitle("A statement here. And is this the hook?"), "And is this the hook?");
  const long = "word ".repeat(50);
  assert.ok(deriveTitle(long).length <= 65);
});

test("empty transcript yields no clips", () => {
  assert.deepEqual(selectHighlights({ duration: 0, segments: [] }), []);
});
