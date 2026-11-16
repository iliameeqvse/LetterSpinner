const GraphemeSplitter = require('grapheme-splitter');

const splitter = new GraphemeSplitter();
const ALIGNMENT_SECONDS = 12;
const MAX_ANIMATED_LETTERS = 600;
const FONTS = ['NotoSansGeorgian', 'NotoSerifGeorgian'];

function hash(seed, page, index) {
  const value = JSON.stringify([seed, page, index]);
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return result;
}

function isSupportedLetter(grapheme) {
  for (const character of grapheme) {
    if (!/\p{Letter}/u.test(character)) continue;
    if (!/[\p{Script_Extensions=Latin}\p{Script_Extensions=Georgian}]/u.test(character)) return false;
  }
  return true;
}

function segmentPage(text, seed, page, minTurns = 2, maxTurns = 4) {
  if (!Number.isInteger(minTurns) || !Number.isInteger(maxTurns) || minTurns < 1 || maxTurns > 6 || minTurns >= maxTurns) {
    throw new RangeError('Choose at least two speeds from one to six turns.');
  }
  const graphemes = splitter.splitGraphemes(text);
  const unsupportedScript = graphemes.some(grapheme => !isSupportedLetter(grapheme));
  let eligible = 0;
  let previousTurns;
  let previousFont;
  const tokens = graphemes.map((value, index) => {
    const letter = /\p{Letter}/u.test(value);
    if (!letter || !isSupportedLetter(value)) return { value, index, letter: false };
    eligible++;
    const choices = maxTurns - minTurns + 1;
    let turns = minTurns + hash(seed, page, index) % choices;
    if (turns === previousTurns) turns = minTurns + (turns - minTurns + 1) % choices;
    previousTurns = turns;
    let font = FONTS[hash(seed, page, index + 104729) % FONTS.length];
    if (font === previousFont) font = FONTS[(FONTS.indexOf(font) + 1) % FONTS.length];
    previousFont = font;
    return { value, index, letter: true, turns, font };
  });
  return { tokens, eligible, canAnimate: !unsupportedScript && eligible <= MAX_ANIMATED_LETTERS && eligible > 0,
    reason: unsupportedScript ? 'This page contains an unsupported script.' : eligible > MAX_ANIMATED_LETTERS ? 'This page is too long to animate smoothly on mobile.' : null };
}

module.exports = { segmentPage, ALIGNMENT_SECONDS, MAX_ANIMATED_LETTERS };
