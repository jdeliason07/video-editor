const test = require("node:test");
const assert = require("node:assert/strict");
const {
  planCuts,
  computeKeepSegments,
  remapTimestamp,
  buildJumpCutFilters,
  CUT_PADDING_SECONDS,
} = require("../lib/ffmpeg/silenceCuts");

const editing = (overrides = {}) => ({ cutSensitivity: "high", minShotSeconds: 0, ...overrides });

test("planCuts keeps only silences longer than the sensitivity threshold", () => {
  const silences = [
    { start: 1.0, end: 1.2 }, // 0.2s: natural pause, below high threshold (0.35)
    { start: 3.0, end: 4.0 }, // 1.0s: breath pause, cut
  ];
  const cuts = planCuts(silences, 10, editing());
  assert.equal(cuts.length, 1);
  assert.ok(Math.abs(cuts[0].start - (3.0 + CUT_PADDING_SECONDS)) < 1e-9);
  assert.ok(Math.abs(cuts[0].end - (4.0 - CUT_PADDING_SECONDS)) < 1e-9);
});

test("planCuts respects minShotSeconds spacing between cuts", () => {
  const silences = [
    { start: 2.0, end: 3.0 },
    { start: 3.4, end: 4.4 }, // would leave a ~0.5s shot after the first cut
    { start: 9.0, end: 10.0 },
  ];
  const cuts = planCuts(silences, 12, editing({ minShotSeconds: 1.5 }));
  assert.equal(cuts.length, 2);
  assert.ok(Math.abs(cuts[0].start - 2.06) < 1e-9);
  assert.ok(Math.abs(cuts[1].start - 9.06) < 1e-9);
});

test("planCuts skips a cut that would truncate the opening shot", () => {
  const cuts = planCuts([{ start: 0.5, end: 1.5 }], 10, editing({ minShotSeconds: 2 }));
  assert.equal(cuts.length, 0);
});

test("computeKeepSegments inverts cuts across the full duration", () => {
  const keep = computeKeepSegments([{ start: 2, end: 3 }, { start: 5, end: 6 }], 10);
  assert.deepEqual(keep, [
    { start: 0, end: 2 },
    { start: 3, end: 5 },
    { start: 6, end: 10 },
  ]);
});

test("computeKeepSegments never returns an empty edit", () => {
  const keep = computeKeepSegments([{ start: 0, end: 10 }], 10);
  assert.deepEqual(keep, [{ start: 0, end: 10 }]);
});

test("remapTimestamp shifts times past cuts onto the post-cut timeline", () => {
  const cuts = [{ start: 2, end: 3 }, { start: 5, end: 6 }];
  assert.equal(remapTimestamp(1.0, cuts), 1.0); // before any cut
  assert.equal(remapTimestamp(2.5, cuts), 2.0); // inside first cut collapses to its start
  assert.equal(remapTimestamp(4.0, cuts), 3.0); // after first cut: shifted by 1s
  assert.equal(remapTimestamp(7.0, cuts), 5.0); // after both cuts: shifted by 2s
});

test("buildJumpCutFilters emits synchronized select/aselect conditions", () => {
  const { videoFilter, audioFilter } = buildJumpCutFilters([
    { start: 0, end: 2 },
    { start: 3, end: 10 },
  ]);
  assert.match(videoFilter, /select='between\(t,0\.000,2\.000\)\+between\(t,3\.000,10\.000\)'/);
  assert.match(videoFilter, /setpts=N\/FRAME_RATE\/TB/);
  assert.match(audioFilter, /aselect='between\(t,0\.000,2\.000\)\+between\(t,3\.000,10\.000\)'/);
  assert.match(audioFilter, /asetpts=N\/SR\/TB/);
});
