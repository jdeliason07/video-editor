const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  wrapCaptionText,
  hexToFfmpegColor,
  buildFrameFilter,
  buildGradeFilters,
  buildCaptionFilters,
  buildLoudnormFilter,
} = require("../lib/ffmpeg/filters");
const { DEFAULT_PROFILE } = require("../utils/styleParser");

test("frame filter targets exactly 1080x1920 with cover-crop", () => {
  const filter = buildFrameFilter();
  assert.match(filter, /scale=1080:1920:force_original_aspect_ratio=increase/);
  assert.match(filter, /crop=1080:1920/);
});

test("hex colors convert to ffmpeg 0x form", () => {
  assert.equal(hexToFfmpegColor("#F5C518"), "0xF5C518");
});

test("wrapCaptionText keeps short text on one line and wraps long text", () => {
  assert.equal(wrapCaptionText("Hello", 56), "Hello");
  const wrapped = wrapCaptionText(
    "This is a much longer caption that cannot possibly fit on a single line of a vertical frame",
    76
  );
  assert.ok(wrapped.includes("\n"));
  for (const line of wrapped.split("\n")) {
    assert.ok(line.length <= 24, `line too long for fontsize 76: "${line}"`);
  }
});

test("grade filters reflect the profile and omit no-op colorbalance", () => {
  const neutral = buildGradeFilters(DEFAULT_PROFILE.video);
  assert.equal(neutral.length, 1); // just eq; no balance, sharpen, or vignette
  assert.match(neutral[0], /^eq=contrast=1\.000/);

  const graded = buildGradeFilters({
    ...DEFAULT_PROFILE.video,
    sharpen: 0.5,
    vignette: true,
    colorBalance: { ...DEFAULT_PROFILE.video.colorBalance, shadows: { r: 0.1, g: 0, b: -0.1 } },
  });
  assert.equal(graded.length, 4);
  assert.match(graded[1], /colorbalance=rs=0\.100/);
  assert.match(graded[2], /unsharp=5:5:1\.00/);
  assert.equal(graded[3], "vignette=PI/5");
});

test("caption filters write textfiles and gate cues to their windows", () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "filters-test-"));
  try {
    const captions = { ...DEFAULT_PROFILE.captions, uppercase: true, animation: "fade" };
    const filters = buildCaptionFilters(
      [{ text: "It's 100% safe: even colons, quotes, and % signs", start: 0.5, end: 4 }],
      captions,
      workDir
    );
    assert.equal(filters.length, 1);
    assert.match(filters[0], /textfile='.*cue-0\.txt'/);
    assert.match(filters[0], /enable='between\(t,0\.500,4\.000\)'/);
    assert.match(filters[0], /alpha='if\(/); // fade animation present
    assert.match(filters[0], /borderw=3/); // default outline

    const written = fs.readFileSync(path.join(workDir, "cue-0.txt"), "utf-8");
    assert.match(written, /^IT'S 100% SAFE/); // uppercased, raw text preserved verbatim
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("caption background box uses the brand's box color and opacity", () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "filters-test-"));
  try {
    const captions = { ...DEFAULT_PROFILE.captions, backgroundBox: true, boxColor: "#E23D7C", boxOpacity: 0.88, outlineWidth: 0 };
    const [filter] = buildCaptionFilters([{ text: "Run. Give.", start: 0, end: 2 }], captions, workDir);
    assert.match(filter, /boxcolor=0xE23D7C@0\.88/);
    assert.doesNotMatch(filter, /:borderw=/); // no text outline (boxborderw is the box padding)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("loudnorm filter switches to precise linear mode when measurements exist", () => {
  const audio = DEFAULT_PROFILE.audio;
  assert.equal(buildLoudnormFilter(audio), "loudnorm=I=-14:TP=-1.5:LRA=11");
  const twoPass = buildLoudnormFilter(audio, {
    input_i: -23.1,
    input_tp: -5.2,
    input_lra: 4.3,
    input_thresh: -33.5,
    target_offset: 0.4,
  });
  assert.match(twoPass, /measured_I=-23\.1/);
  assert.match(twoPass, /offset=0\.4/);
  assert.match(twoPass, /linear=true/);
});
