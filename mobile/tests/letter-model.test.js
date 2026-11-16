const test = require('node:test');
const assert = require('node:assert/strict');
const { segmentPage, ALIGNMENT_SECONDS } = require('../src/letter-model');

test('Latin and Georgian letters get varied fonts and shared-cycle speeds', () => {
  const result = segmentPage('Hello გამარჯობა', 42, 1, 2, 4);
  assert.equal(result.canAnimate, true);
  const letters = result.tokens.filter(token => token.letter);
  assert.equal(letters.length, 14);
  for (let i = 1; i < letters.length; i++) {
    assert.notEqual(letters[i].turns, letters[i - 1].turns);
    assert.notEqual(letters[i].font, letters[i - 1].font);
  }
  letters.forEach(letter => assert.equal((360 * letter.turns * ALIGNMENT_SECONDS / ALIGNMENT_SECONDS) % 360, 0));
  assert.deepEqual(segmentPage('Hello გამარჯობა', 42, 1, 2, 4), result);
});

test('chosen range and unsupported scripts use expected limits', () => {
  const result = segmentPage('Words', 1, 1, 4, 6);
  result.tokens.filter(token => token.letter).forEach(token => assert.ok(token.turns >= 4 && token.turns <= 6));
  assert.equal(segmentPage('مرحبا', 1, 1).canAnimate, false);
  assert.equal(segmentPage('a'.repeat(601), 1, 1).canAnimate, false);
  assert.throws(() => segmentPage('Hi', 1, 1, 3, 3));
});
