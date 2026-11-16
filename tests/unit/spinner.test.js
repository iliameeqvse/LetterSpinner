import test from 'node:test';
import assert from 'node:assert/strict';
import { createParameters, createFontFamily, FONT_FAMILIES, angleAt, PageClock, ALIGNMENT_SECONDS } from '../../src/spinner.js';

function fixture(conditions = {}) {
  let time = 0;
  const clock = new PageClock({ now: () => time, ...conditions });
  return { clock, at(value) { time = value; } };
}

function paragraph(seed, page) {
  // Original indices include skipped punctuation, digits, emoji and spaces.
  const graphemes = Array.from('Hello, world! 123 A longer paragraph. '.repeat(80));
  let previous;
  return graphemes.flatMap((letter, index) => {
    if (!/[a-z]/i.test(letter)) return [];
    const parameters = createParameters(seed, page, index, previous);
    previous = parameters.period;
    return [{ index, ...parameters }];
  });
}

test('page regeneration and revisits reproduce all eligible parameters', () => {
  const original = paragraph('document session', 7);
  paragraph('other document', 1);
  paragraph('document session', 8);
  assert.deepEqual(paragraph('document session', 7), original);
  assert.notDeepEqual(paragraph('other document', 7), original);
  assert.notDeepEqual(paragraph('document session', 8), original);
  assert.deepEqual(createParameters('1', 1, 0), createParameters('1', 1, 0));
});

test('known paragraph periods, phases and adjacent eligible periods meet A05', () => {
  for (const seed of ['session', '', 0, 4294967295]) {
    const parameters = paragraph(seed, 1);
    assert.ok(parameters.length > 1000);
    parameters.forEach((parameter, i) => {
      assert.ok(parameter.period >= 3 && parameter.period <= 8);
      assert.ok(parameter.angle >= 0 && parameter.angle < 360);
      if (i) assert.notEqual(parameter.period, parameters[i - 1].period);
    });
  }
});

test('passing the previous eligible period resolves collisions across gaps', () => {
  let previous;
  for (let index = 0; index < 10000; index += 1) {
    const { period } = createParameters(123, 2, index);
    const corrected = createParameters(123, 2, index, previous);
    if (previous !== undefined) assert.notEqual(corrected.period, previous);
    assert.ok(corrected.period >= 3 && corrected.period <= 8);
    assert.equal(corrected.angle, createParameters(123, 2, index).angle);
    previous = corrected.period;
  }
});

test('all letters start upright and align after every shared cycle', () => {
  assert.equal(ALIGNMENT_SECONDS, 12);
  const letters = paragraph('Georgian document', 2);
  assert.deepEqual(new Set(letters.map(letter => letter.period)), new Set([3, 4, 6]));
  for (const letter of letters) {
    for (const elapsed of [0, 12, 24, 36]) {
      assert.ok(Math.min(angleAt(letter, elapsed), 360 - angleAt(letter, elapsed)) < 1e-9);
    }
  }
});

test('parameter generation rejects invalid identities and prior periods', () => {
  for (const seed of [undefined, null, {}, NaN, Infinity]) {
    assert.throws(() => createParameters(seed, 1, 0));
  }
  for (const page of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createParameters('s', page, 0));
  }
  for (const index of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createParameters('s', 1, index));
  }
  for (const period of [null, NaN, Infinity, 1.999, 12.001]) {
    assert.throws(() => createParameters('s', 1, 0, period));
  }
});

test('chosen speed range keeps adjacent letters distinct and preserves shared alignment', () => {
  for (const range of [{ minTurns: 1, maxTurns: 2 }, { minTurns: 4, maxTurns: 6 }]) {
    let previous;
    const observed = new Set();
    for (let index = 0; index < 100; index++) {
      const parameter = createParameters('range', 1, index, previous, range);
      const turns = ALIGNMENT_SECONDS / parameter.period;
      assert.ok(turns >= range.minTurns && turns <= range.maxTurns);
      if (previous !== undefined) assert.notEqual(parameter.period, previous);
      assert.ok(Math.abs(angleAt(parameter, ALIGNMENT_SECONDS)) < 1e-9);
      observed.add(turns);
      previous = parameter.period;
    }
    assert.ok(observed.size > 1);
  }
  for (const range of [{ minTurns: 2, maxTurns: 2 }, { minTurns: 0, maxTurns: 2 }, { minTurns: 2, maxTurns: 7 }]) {
    assert.throws(() => createParameters('range', 1, 0, undefined, range));
  }
});

test('letter fonts vary deterministically across adjacent eligible letters', () => {
  let previous;
  const observed = new Set();
  for (let index = 0; index < 60; index++) {
    const family = createFontFamily('fonts', 1, index, previous);
    assert.ok(FONT_FAMILIES.includes(family));
    if (previous) assert.notEqual(family, previous);
    assert.equal(createFontFamily('fonts', 1, index, previous), family);
    observed.add(family);
    previous = family;
  }
  assert.ok(observed.size >= 3);
});

test('angle equation rotates clockwise, wraps and follows speed-scaled seconds', () => {
  assert.equal(angleAt({ period: 4, angle: 270 }, 0), 270);
  assert.equal(angleAt({ period: 4, angle: 270 }, 1), 0);
  assert.equal(angleAt({ period: 4, angle: 270 }, 2), 90);
  assert.equal(angleAt({ period: 4, angle: 270 }, 4000002), 90);
  const parameters = createParameters('seed', 1, 0);
  const expected = (parameters.angle + 360 * 2.5 / parameters.period) % 360;
  assert.ok(Math.abs(angleAt(parameters, 2.5) - expected) < 1e-10);
  assert.throws(() => angleAt({ period: 0, angle: 0 }, 0));
  assert.throws(() => angleAt({ period: 3, angle: NaN }, 0));
  assert.throws(() => angleAt({ period: 3, angle: 0 }, -1));
});

test('clock starts at zero and loading time does not count', () => {
  const { clock, at } = fixture();
  at(10000);
  assert.equal(clock.getElapsed(), 0);
  assert.equal(clock.runningSince, null);
  clock.setConditions({ ready: true });
  assert.equal(clock.runningSince, 10000);
  at(12000);
  assert.equal(clock.getElapsed(), 2);
});

test('pause longer than a second freezes exact clock and angle; resume continues (A06)', () => {
  const { clock, at } = fixture({ ready: true });
  const parameters = createParameters('seed', 1, 42);
  at(1250);
  assert.equal(clock.setConditions({ userPaused: true }), 1.25);
  const pose = angleAt(parameters, clock.getElapsed());
  at(6250);
  assert.equal(clock.getElapsed(), 1.25);
  assert.equal(angleAt(parameters, clock.getElapsed()), pose);
  clock.setConditions({ userPaused: false });
  at(7250);
  assert.equal(clock.getElapsed(), 2.25);
});

test('speed changes preserve phase and apply old speed through each transition (A07)', () => {
  const { clock } = fixture({ ready: true });
  const parameters = createParameters('seed', 1, 0);
  const pose = angleAt(parameters, clock.getElapsed(1000));
  assert.equal(clock.setConditions({ speed: 2 }, 1000), 1);
  assert.equal(angleAt(parameters, clock.getElapsed(1000)), pose);
  assert.equal(clock.getElapsed(2000), 3);
  assert.equal(clock.setConditions({ speed: 0.25 }, 2500), 4);
  assert.equal(clock.getElapsed(4500), 4.5);
});

test('paused speed edits do not rotate; rapid updates use final value', () => {
  const { clock } = fixture({ ready: true });
  clock.setConditions({ userPaused: true }, 1000);
  clock.setConditions({ speed: 2 }, 2000);
  clock.setConditions({ speed: 0.25 }, 3000);
  assert.equal(clock.getElapsed(5000), 1);
  clock.setConditions({ userPaused: false }, 5000);
  clock.setConditions({ speed: 1.5 }, 5000);
  clock.setConditions({ speed: 0.5 }, 5000);
  clock.setConditions({ speed: 2 }, 5000);
  assert.equal(clock.getElapsed(6000), 3);
});

test('each static gate freezes time independently without hidden-time catch-up (A08-A10)', () => {
  for (const [key, frozen, playing] of [
    ['hidden', true, false], ['normalMode', true, false],
    ['ready', false, true], ['animationAllowed', false, true],
  ]) {
    const { clock } = fixture({ ready: true });
    assert.equal(clock.setConditions({ [key]: frozen }, 1000), 1);
    assert.equal(clock.getElapsed(61000), 1);
    clock.setConditions({ [key]: playing }, 62000);
    assert.equal(clock.getElapsed(63000), 2);
  }
});

test('overlapping gates and forced static preserve underlying user choices', () => {
  const { clock } = fixture({ ready: true, normalMode: true, userPaused: true });
  clock.setConditions({ animationAllowed: false }, 1000);
  clock.setConditions({ speed: 2, hidden: true }, 2000);
  clock.setConditions({ animationAllowed: true }, 3000);
  clock.setConditions({ hidden: false, normalMode: false }, 4000);
  assert.equal(clock.getElapsed(5000), 0);
  assert.equal(clock.snapshot(5000).userPaused, true);
  clock.setConditions({ userPaused: false }, 5000);
  assert.equal(clock.getElapsed(6000), 2);
});

test('stopped page restores saved time after cache eviction and independent page playback (A09)', () => {
  const pageOne = fixture({ ready: true });
  const parameters = paragraph('session', 1);
  assert.equal(pageOne.clock.stop(2000), 2);
  const saved = pageOne.clock.snapshot(3000);
  assert.equal(saved.ready, false);
  assert.equal(pageOne.clock.runningSince, null);
  const pageTwo = fixture({ ready: true });
  assert.equal(pageTwo.clock.getElapsed(10000), 10);
  assert.equal(pageOne.clock.getElapsed(13000), 2);
  const restored = new PageClock({ ...saved, now: () => 13000 });
  assert.deepEqual(paragraph('session', 1), parameters);
  assert.equal(restored.getElapsed(15000), 2);
  restored.setConditions({ ready: true }, 15000);
  assert.equal(restored.getElapsed(16000), 3);
});

test('explicit timestamp zero and injected monotonic milliseconds are respected', () => {
  const { clock, at } = fixture({ ready: true, accumulatedSeconds: 7 });
  assert.equal(clock.setConditions({ speed: 0.25 }, 0), 7);
  at(1000);
  assert.equal(clock.getElapsed(), 7.25);
  assert.equal(clock.accumulatedSeconds, 7.25);
  assert.equal(clock.runningSince, 1000);
});

test('invalid transitions and backwards timestamps leave clock state intact', () => {
  const { clock } = fixture({ ready: true });
  assert.equal(clock.getElapsed(1000), 1);
  for (const patch of [{ speed: 0 }, { speed: 2.01 }, { speed: NaN }, { hidden: 1 }, { typo: true }]) {
    assert.throws(() => clock.setConditions(patch, 2000));
  }
  assert.throws(() => clock.setConditions({ userPaused: true }, 999));
  assert.throws(() => clock.getElapsed(NaN));
  assert.equal(clock.getElapsed(2000), 2);
  assert.equal(clock.snapshot(2000).userPaused, false);
  assert.throws(() => new PageClock({ accumulatedSeconds: -1 }));
  assert.throws(() => new PageClock({ now: () => Infinity }));
});

test('disposal freezes permanently and repeated disposal does not sample the source', () => {
  const { clock, at } = fixture({ ready: true });
  at(2000);
  assert.equal(clock.dispose(), 2);
  at(100000);
  assert.equal(clock.getElapsed(), 2);
  assert.equal(clock.dispose(), 2);
  assert.equal(clock.running, false);
  assert.equal(clock.runningSince, null);
  assert.throws(() => clock.setConditions({ ready: true }));
  assert.equal(clock.snapshot().accumulatedSeconds, 2);
});
