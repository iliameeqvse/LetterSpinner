/**
 * Reconstruct PDF.js-like plain text items without DOM or PDF.js dependencies.
 * viewportTransform is the six-number transform from a scale-1 PDF viewport.
 * Indices are grapheme ordinals in the complete normalized string.
 * Eligibility describes the grapheme itself; callers must also check
 * animationAllowed. Over-limit text is retained in full, never truncated.
 * staticReason is null or one of: no-text, page-text-limit, animation-limit,
 * non-latin, rtl, vertical, rotated, invalid-geometry.
 * warnings contains user-readable notices. Missing Intl.Segmenter throws an
 * Error with code UNSUPPORTED_BROWSER; never split UTF-16 as a fallback.
 */
export function buildPageModel(items, viewportTransform, pageNumber) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError("pageNumber must be a positive integer");
  }
  if (typeof Intl?.Segmenter !== "function") {
    const error = new Error("This browser requires Intl.Segmenter to read pages.");
    error.code = "UNSUPPORTED_BROWSER";
    throw error;
  }

  // Marked-content records have no str. Retain actual source indices.
  const fragments = items.flatMap((item, index) =>
    item && typeof item.str === "string" && item.str.length
      ? [{ item, index }]
      : []);
  const reasons = new Set();
  const positioned = [];
  for (const fragment of fragments) {
    const { item } = fragment;
    if (item.dir === "rtl" || RTL_TEXT.test(item.str)) reasons.add("rtl");
    if (item.dir === "ttb" || item.vertical === true) reasons.add("vertical");
    const geometry = measure(item, viewportTransform);
    if (!geometry) {
      reasons.add("invalid-geometry");
    } else {
      if (Math.abs(Math.atan2(geometry.dy, geometry.dx)) > TWO_DEGREES + 1e-12) {
        reasons.add("rotated");
      }
      positioned.push({ ...fragment, ...geometry });
    }
  }

  const fallbackReason = ["invalid-geometry", "rtl", "vertical", "rotated"]
    .find(reason => reasons.has(reason));
  const joined = fallbackReason
    ? fragments.map(({ item }) => item.str + (item.hasEOL ? "\n" : "")).join("")
    : reconstruct(positioned);
  const plainText = normalize(joined);
  const warnings = [];
  if (fallbackReason) {
    warnings.push("Normal text only: unsupported direction or geometry. Text follows source order; reading order is not reliable.");
  }
  if (plainText.includes("\uFFFD")) {
    warnings.push("Some characters could not be decoded.");
  }

  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  let unsupportedScript = false;
  let eligibleCount = 0;
  const graphemes = Array.from(segmenter.segment(plainText), ({ segment: text }, index) => {
    let supported = false;
    let other = false;
    for (const character of text) {
      if (!LETTER.test(character)) continue;
      if (LATIN.test(character) || GEORGIAN.test(character)) supported = true;
      else other = true;
    }
    unsupportedScript ||= other;
    const eligible = supported && !other;
    if (eligible) eligibleCount++;
    return { text, eligible, index };
  });

  let staticReason = null;
  if (!plainText.trim()) staticReason = "no-text";
  else if (graphemes.length > 20_000) staticReason = "page-text-limit";
  else if (fallbackReason) staticReason = fallbackReason;
  else if (unsupportedScript) staticReason = "non-latin";
  else if (eligibleCount > 5_000) staticReason = "animation-limit";

  if (unsupportedScript) {
    warnings.push("Normal text only: this page contains letters in an unsupported script; extraction fidelity is not guaranteed.");
  }
  if (staticReason === "page-text-limit") {
    warnings.push("This page exceeds the 20,000-grapheme text limit.");
  }
  if (eligibleCount > 5_000) {
    warnings.push("Normal text only: this page exceeds the 5,000-letter animation limit.");
  }
  return {
    pageNumber, plainText, graphemes,
    animationAllowed: staticReason === null, staticReason, warnings,
  };
}

const TWO_DEGREES = 2 * Math.PI / 180;
const LETTER = /\p{Letter}/u;
const LATIN = /\p{Script_Extensions=Latin}/u;
const GEORGIAN = /\p{Script_Extensions=Georgian}/u;
// Conservative RTL ranges also catch RTL text whose extraction dir is absent.
// Some neutral characters in these blocks may conservatively force fallback.
const RTL_TEXT = /[\u0590-\u08ff\u200f\u202b\u202e\u2067\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1eeff}]/u;
const LIGATURES = ["ff", "fi", "fl", "ffi", "ffl", "st", "st"];

function normalize(text) {
  return text.replace(/[\ufb00-\ufb06]/gu, character =>
    LIGATURES[character.charCodeAt(0) - 0xfb00])
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map(line => line.replace(/[^\S\n]+/gu, " ").trim())
    .join("\n")
    .trim()
    .normalize("NFC");
}

function validTransform(value) {
  return (Array.isArray(value) || ArrayBuffer.isView(value))
    && value.length === 6 && Array.from(value).every(Number.isFinite);
}

function measure(item, viewport) {
  if (!validTransform(viewport) || !validTransform(item.transform)
      || !Number.isFinite(item.width) || item.width < 0) return null;
  const [a, b, c, d, e, f] = item.transform;
  const [va, vb, vc, vd, ve, vf] = viewport;
  const x = va * e + vc * f + ve;
  const y = vb * e + vd * f + vf;
  const dx = va * a + vc * b;
  const dy = vb * a + vd * b;
  const size = Math.hypot(va * c + vc * d, vb * c + vd * d);
  const axis = Math.hypot(a, b);
  const advance = item.width * Math.hypot(dx, dy) / axis;
  const endX = x + advance * dx / Math.hypot(dx, dy);
  if (![x, y, dx, dy, size, advance, endX].every(Number.isFinite)
      || size <= 0 || Math.hypot(dx, dy) <= 0) return null;
  return { x, y, dx, dy, size, endX };
}

function reconstruct(fragments) {
  const rows = [];
  for (const fragment of fragments) {
    let nearest;
    let distance = Infinity;
    for (const row of rows) {
      const delta = Math.abs(fragment.y - row.y);
      const tolerance = Math.max(1, 0.25 * Math.min(fragment.size, row.size));
      // Strict comparison preserves creation order on equal distances.
      if (delta <= tolerance && delta < distance) {
        nearest = row;
        distance = delta;
      }
    }
    if (!nearest) {
      nearest = { y: fragment.y, size: fragment.size, index: rows.length, fragments: [] };
      rows.push(nearest);
    }
    nearest.fragments.push(fragment);
  }
  rows.sort((a, b) => a.y - b.y || a.index - b.index);
  return rows.map(row => {
    row.fragments.sort((a, b) => a.x - b.x || a.index - b.index);
    let text = "";
    let previous;
    for (const fragment of row.fragments) {
      if (previous && !/\s$/u.test(previous.item.str) && !/^\s/u.test(fragment.item.str)
          && fragment.x - previous.endX > 0.2 * Math.min(previous.size, fragment.size)) {
        text += " ";
      }
      text += fragment.item.str;
      previous = fragment;
    }
    // No paragraph inference, including when hasEOL is present.
    return text.replace(/\s+/gu, " ").trim();
  }).filter(Boolean).join(" ");
}
