const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PROFILE,
  normalizeProfile,
  parseStyleOverride,
  listBrandProfiles,
  loadBrandProfile,
} = require("../utils/styleParser");

test("every shipped brand profile validates and normalizes", () => {
  const profiles = listBrandProfiles();
  assert.equal(profiles.length, 4);
  const ids = profiles.map((p) => p.id).sort();
  assert.deepEqual(ids, ["adrian_per", "chaad_hewitt", "jefferson_fisher", "william_scott"]);
  for (const profile of profiles) {
    assert.match(profile.captions.primaryColor, /^#[0-9A-F]{6}$/);
    assert.equal(profile.audio.targetLUFS, -14);
  }
});

test("normalizeProfile clamps out-of-range numeric values", () => {
  const profile = normalizeProfile({ video: { contrast: 99, brightness: -5 } });
  assert.equal(profile.video.contrast, 2.2);
  assert.equal(profile.video.brightness, -0.3);
});

test("normalizeProfile reports every problem at once", () => {
  assert.throws(
    () => normalizeProfile({ video: { contrast: "high" }, captions: { primaryColor: "yellow", position: "everywhere" } }),
    (err) => {
      assert.match(err.message, /video\.contrast/);
      assert.match(err.message, /primaryColor/);
      assert.match(err.message, /position/);
      return true;
    }
  );
});

test("normalizeProfile expands 3-digit hex colors", () => {
  const profile = normalizeProfile({ captions: { primaryColor: "#fc0" } });
  assert.equal(profile.captions.primaryColor, "#FFCC00");
});

test("keyword rules translate brand vocabulary into parameters", () => {
  const { profile, appliedRules } = parseStyleOverride(
    "Keep it moody and cinematic with warm shadows and a minimalist layout.",
    DEFAULT_PROFILE
  );
  assert.ok(profile.video.contrast > DEFAULT_PROFILE.video.contrast);
  assert.ok(profile.video.gamma < DEFAULT_PROFILE.video.gamma);
  assert.equal(profile.video.vignette, true);
  assert.ok(profile.video.colorBalance.shadows.r > 0);
  assert.equal(profile.captions.animation, "none");
  const names = appliedRules.map((r) => r.name);
  assert.ok(names.includes("moody / dark shadows"));
  assert.ok(names.includes("warm tone"));
  assert.ok(names.includes("minimalist / zero clutter"));
});

test("explicit directives set values outright and beat keyword rules", () => {
  const { profile } = parseStyleOverride(
    ["High contrast look.", "- contrast: 1.05", "- caption color: #FF5500", "position: lower-third"].join("\n"),
    DEFAULT_PROFILE
  );
  assert.equal(profile.video.contrast, 1.05); // directive wins over "high contrast" keyword
  assert.equal(profile.captions.primaryColor, "#FF5500");
  assert.equal(profile.captions.position, "lower-third");
});

test("bare hex codes set the caption color", () => {
  const { profile } = parseStyleOverride("Titles in #12ab34 please", DEFAULT_PROFILE);
  assert.equal(profile.captions.primaryColor, "#12AB34");
});

test("override result is still clamped into safe ranges", () => {
  const { profile } = parseStyleOverride("contrast: 500", DEFAULT_PROFILE);
  assert.equal(profile.video.contrast, 2.2);
});

test("empty override returns the base profile unchanged", () => {
  const base = loadBrandProfile("adrian_per");
  const { profile, appliedRules } = parseStyleOverride("", base);
  assert.deepEqual(profile, base);
  assert.equal(appliedRules.length, 0);
});
