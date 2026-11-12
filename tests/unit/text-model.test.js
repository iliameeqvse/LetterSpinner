import test from "node:test";
import assert from "node:assert/strict";
import { buildPageModel } from "../../src/text-model.js";

const viewport = [1, 0, 0, -1, 0, 100];
const item = (str, x = 0, y = 80, width = str.length * 5, size = 10, extra = {}) => ({
  str, transform: [size, 0, 0, size, x, y], width, dir: "ltr", ...extra,
});
const build = (items, transform = viewport, pageNumber = 1) =>
  buildPageModel(items, transform, pageNumber);

test("public contract, stable ordinal indices, and no input mutation", () => {
  const input = [item("Ab 1!")];
  const snapshot = structuredClone(input);
  const model = build(input, viewport, 7);
  assert.deepEqual(Object.keys(model).sort(),
    ["pageNumber", "plainText", "graphemes", "animationAllowed", "staticReason", "warnings"].sort());
  assert.equal(model.pageNumber, 7);
  assert.equal(model.plainText, "Ab 1!");
  assert.deepEqual(model.graphemes, [
    { text: "A", eligible: true, index: 0 }, { text: "b", eligible: true, index: 1 },
    { text: " ", eligible: false, index: 2 }, { text: "1", eligible: false, index: 3 },
    { text: "!", eligible: false, index: 4 },
  ]);
  assert.equal(model.animationAllowed, true);
  assert.equal(model.staticReason, null);
  assert.deepEqual(model.warnings, []);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(build(input, viewport, 7), model);
});

test("Georgian text and mixed Georgian/Latin pages are eligible to spin", () => {
  for (const text of ["გამარჯობა", "Hello გამარჯობა", "Ⴀⴀა"]) {
    const model = build([item(text)]);
    assert.equal(model.plainText, text);
    assert.equal(model.animationAllowed, true);
    assert.equal(model.staticReason, null);
    assert.ok(model.graphemes.filter(g => /\p{Letter}/u.test(g.text)).every(g => g.eligible));
  }
});

test("A02 fragment boundaries concatenate; only gaps strictly above threshold add spaces", () => {
  for (const [gap, expected] of [[0, "Helloworld"], [2, "Helloworld"], [2.001, "Hello world"]]) {
    assert.equal(build([item("Hel", 0, 80, 15), item("lo", 15, 80, 10),
      item("world", 25 + gap)]).plainText, expected);
  }
  assert.equal(build([item("A", 0, 80, 5, 20), item("B", 7, 80, 5, 10)]).plainText, "AB");
  assert.equal(build([item("A", 0, 80, 5), item("B", 3)]).plainText, "AB");
});

test("A03 geometry determines row and fragment order, preserves spaces and hyphens", () => {
  const model = build([
    item("national", 0, 60), item("inter-", 0, 80, 30, 10, { hasEOL: true }),
    item("  done   ", 40, 60), item("now", 100, 60),
  ]);
  assert.equal(model.plainText, "inter- national done now");
  assert.equal(build([item("a  ", 0, 80, 10), item(" b", 10)]).plainText, "a b");
});

test("row tolerance is inclusive, uses smaller size, and has a one-unit floor", () => {
  assert.equal(build([item("A", 0, 80, 5), item("B", 5, 77.5)]).plainText, "AB");
  assert.equal(build([item("A", 0, 80, 5), item("B", 5, 77.499)]).plainText, "A B");
  assert.equal(build([item("A", 0, 80, 1, 2), item("B", 1, 79, 1, 2)]).plainText, "AB");
  assert.equal(build([item("A", 0, 80, 5, 20), item("B", 5, 77, 5, 10)]).plainText, "A B");
});

test("nearest row wins; equal distances use row creation; row baseline stays fixed", () => {
  assert.equal(build([item("A", 0, 80, 5, 20), item("B", 0, 72, 5, 20),
    item("C", 5, 76, 5, 20)]).plainText, "AC B");
  assert.equal(build([item("A", 0, 80, 5, 20), item("B", 0, 72, 5, 20),
    item("C", 5, 75, 5, 20)]).plainText, "A BC");
  assert.equal(build([item("A", 0, 80, 5), item("B", 5, 78, 5),
    item("C", 10, 76, 5)]).plainText, "AB C");
});

test("identical geometry uses original indices; marked-content entries are ignored", () => {
  assert.equal(build([{ type: "beginMarkedContent", id: "x" }, item("A", 0),
    { type: "endMarkedContent" }, item("B", 0)]).plainText, "AB");
});

test("viewport composition accounts for page rotation, translation and advance scale", () => {
  const rotateViewport = [0, 1, 1, 0, 50, 100];
  const rotatedItem = (str, y, width) => ({
    str, transform: [0, 10, -10, 0, 20, y], width, dir: "ltr",
  });
  const model = build([rotatedItem("B", 5, 5), rotatedItem("A", 0, 5)], rotateViewport);
  assert.equal(model.plainText, "AB");
  assert.equal(model.animationAllowed, true);
  assert.equal(build([item("A", 0, 80, 5), item("B", 7)], [2, 0, 0, -2, 10, 200]).plainText, "AB");
  assert.equal(build([item("A", 0, 80, 5), item("B", 7.1)], [2, 0, 0, -2, 10, 200]).plainText, "A B");
});

test("rotation threshold accepts both signs at two degrees and rejects beyond", () => {
  for (const angle of [-2.001, -2, 2, 2.001, 90, 180]) {
    const r = angle * Math.PI / 180;
    const model = build([item("A", 0, 80, 5, 10, {
      transform: [10 * Math.cos(r), -10 * Math.sin(r), 10 * Math.sin(r), 10 * Math.cos(r), 0, 80],
    })]);
    assert.equal(model.animationAllowed, Math.abs(angle) <= 2);
    if (Math.abs(angle) > 2) assert.equal(model.staticReason, "rotated");
  }
});

test("A04 ligatures expand selectively; NFC applies across adjacent fragments", () => {
  const model = build([item("\uFB00\uFB01\uFB02\uFB03\uFB04\uFB05\uFB06 e", 0, 80, 10),
    item("\u0301 ① ²", 10)]);
  assert.equal(model.plainText, "fffiflffifflstst é ① ²");
  assert.ok(model.graphemes.some(g => g.text === "é" && g.eligible));
  assert.ok(model.graphemes.some(g => g.text === "①" && !g.eligible));
});

test("Intl.Segmenter preserves emoji, flags, accents and stationary digits", () => {
  const model = build([item("e\u0301 👩🏽‍💻 🇬🇪 9!")]);
  assert.deepEqual(model.graphemes.map(g => g.text), ["é", " ", "👩🏽‍💻", " ", "🇬🇪", " ", "9", "!"]);
  assert.deepEqual(model.graphemes.map(g => g.eligible), [true, false, false, false, false, false, false, false]);
  assert.equal(build([item("a\u1AB0")]).graphemes.length, 1);
});

test("non-Latin letters force full-page normal mode while keeping Latin eligibility", () => {
  for (const text of ["AΩ", "A中", "AЖ", "Aअ"]) {
    const model = build([item(text)]);
    assert.equal(model.staticReason, "non-latin");
    assert.equal(model.animationAllowed, false);
    assert.equal(model.graphemes[0].eligible, true);
    assert.equal(model.graphemes[1].eligible, false);
    assert.match(model.warnings.join(" "), /fidelity/);
  }
});

test("RTL and vertical pages use complete source order, EOL and normalization", () => {
  for (const [extra, reason] of [[{ dir: "rtl" }, "rtl"], [{ dir: "ttb" }, "vertical"],
    [{ vertical: true }, "vertical"]]) {
    const model = build([item("  \uFB01  e\u0301 ", 100, 20, 10, 10, { ...extra, hasEOL: true }),
      item(" last", 0, 80)]);
    assert.equal(model.plainText, "fi é\nlast");
    assert.equal(model.staticReason, reason);
    assert.equal(model.animationAllowed, false);
    assert.match(model.warnings.join(" "), /source order.*not reliable/);
  }
  assert.equal(build([item("שלום")]).staticReason, "rtl");
  assert.equal(build([item("مرحبا")]).staticReason, "rtl");
});

test("invalid geometry falls back for whole page without dropping text", () => {
  for (const extra of [{ transform: [1, 0, 0, 1, NaN, 0] }, { width: Infinity },
    { width: -1 }, { transform: [0, 0, 0, 0, 0, 0] }, { transform: [1, 0] },
    { transform: [1e308, 0, 0, 1e308, 1e308, 0] }]) {
    const model = build([item("B", 50, 20, 5, 10, { hasEOL: true, ...extra }), item("A", 0, 80)]);
    assert.equal(model.staticReason, "invalid-geometry");
    assert.equal(model.plainText, "B\nA");
  }
  assert.equal(build([item("A")], [1, 0, 0, NaN, 0, 0]).staticReason, "invalid-geometry");
  assert.equal(build([item("A")], null).staticReason, "invalid-geometry");
});

test("empty text is no-text and does not claim a scan; replacement characters warn", () => {
  for (const items of [[], [{ type: "endMarkedContent" }], [item("   ")], [item("")]]) {
    const model = build(items);
    assert.equal(model.staticReason, "no-text");
    assert.equal(model.plainText, "");
    assert.deepEqual(model.graphemes, []);
    assert.equal(model.animationAllowed, false);
    assert.doesNotMatch(model.warnings.join(" "), /scan/i);
  }
  assert.match(build([item("A\uFFFD")]).warnings.join(" "), /Some characters could not be decoded/);
});

test("A12 caps are inclusive and count normalized graphemes, never truncate", () => {
  assert.equal(build([item("a".repeat(5000))]).animationAllowed, true);
  const animationLimited = build([item("a".repeat(5001))]);
  assert.equal(animationLimited.staticReason, "animation-limit");
  assert.equal(animationLimited.plainText.length, 5001);
  assert.equal(animationLimited.graphemes.length, 5001);
  const atCap = build([item("👩🏽‍💻".repeat(20000))]);
  assert.equal(atCap.graphemes.length, 20000);
  assert.equal(atCap.animationAllowed, true);
  const overCap = build([item("👩🏽‍💻".repeat(20001))]);
  assert.equal(overCap.staticReason, "page-text-limit");
  assert.equal(overCap.graphemes.length, 20001);
  assert.equal(overCap.plainText, "👩🏽‍💻".repeat(20001));
  assert.equal(build([item("\uFB03".repeat(1667))]).staticReason, "animation-limit");
  assert.equal(build([item("e\u0301".repeat(5000))]).animationAllowed, true);
});

test("A16 HTML-like strings stay literal data", () => {
  const text = '<script>alert("x")</script> & <img src=x onerror=alert(1)>';
  assert.equal(build([item(text)]).plainText, text);
});

test("unavailable Intl.Segmenter fails explicitly, never splits code units", () => {
  const original = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    assert.throws(() => build([item("😀")]), { code: "UNSUPPORTED_BROWSER" });
  } finally {
    Intl.Segmenter = original;
  }
});

test("invalid caller arguments fail clearly", () => {
  assert.throws(() => build(null), TypeError);
  for (const page of [0, -1, 1.5, NaN]) {
    assert.throws(() => build([], viewport, page), RangeError);
  }
});
