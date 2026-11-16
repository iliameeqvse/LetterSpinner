/**
 * Deterministic animation math; no DOM, PDF, timers or persistent random state.
 * Periods are seconds, angles are clockwise degrees, timestamps are monotonic ms.
 */
const MIN_PERIOD = 2;
const MAX_PERIOD = 12;
export const ALIGNMENT_SECONDS = 12;
export const FONT_FAMILIES = Object.freeze([
  '"Segoe UI", sans-serif',
  '"Sylfaen", serif',
  '"Georgia", serif',
  '"Arial", sans-serif',
  '"Times New Roman", serif',
]);
const CONDITION_KEYS = ['speed', 'userPaused', 'normalMode', 'hidden', 'ready', 'animationAllowed'];

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function validateConditions(conditions) {
  for (const key of Object.keys(conditions)) {
    if (!CONDITION_KEYS.includes(key)) throw new TypeError(`Unknown condition: ${key}`);
    if (key === 'speed') {
      finite(conditions.speed, 'speed');
      if (conditions.speed < 0.25 || conditions.speed > 2) {
        throw new RangeError('speed must be between 0.25 and 2');
      }
    } else if (typeof conditions[key] !== 'boolean') {
      throw new TypeError(`${key} must be boolean`);
    }
  }
}

/**
 * Return { period, angle } from a string or finite numeric session seed, a
 * one-based pageNumber and a zero-based original grapheme index (safe integers).
 * Reuse the seed for the document lifetime. No random global state is touched.
 * Pass previousPeriod from the previous ELIGIBLE grapheme, even across spaces,
 * punctuation or digits, to guarantee different adjacent eligible periods.
 * All letters start upright and become upright together every 12 seconds of
 * accumulated playback. The user chooses an inclusive range of whole turns
 * per cycle. Rebuild in order for identical results.
 */
export function createParameters(seed, pageNumber, index, previousPeriod, { minTurns = 2, maxTurns = 4 } = {}) {
  if (typeof seed !== 'string' && !(typeof seed === 'number' && Number.isFinite(seed))) {
    throw new TypeError('seed must be a string or finite number');
  }
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError('pageNumber must be a positive safe integer');
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError('index must be a nonnegative safe integer');
  }
  if (previousPeriod !== undefined) {
    finite(previousPeriod, 'previousPeriod');
    if (previousPeriod < MIN_PERIOD || previousPeriod > MAX_PERIOD) {
      throw new RangeError('previousPeriod must be between 2 and 12');
    }
  }
  if (!Number.isInteger(minTurns) || !Number.isInteger(maxTurns)
      || minTurns < 1 || maxTurns > 6 || minTurns >= maxTurns) {
    throw new RangeError('Choose at least two speeds between 1 and 6 turns per cycle');
  }
  // Framing distinguishes both seed types and tuples containing delimiters.
  const key = JSON.stringify([seed, pageNumber, index]);
  let state = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    state = Math.imul(state ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  // Mulberry32 supplies a reproducible choice of turns per shared cycle.
  function randomUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }
  const choices = maxTurns - minTurns + 1;
  let turns = minTurns + randomUint32() % choices;
  if (ALIGNMENT_SECONDS / turns === previousPeriod) turns = minTurns + (turns - minTurns + 1) % choices;
  return { period: ALIGNMENT_SECONDS / turns, angle: 0 };
}

/** Stable font choices; adjacent eligible letters get different families. */
export function createFontFamily(seed, pageNumber, index, previousFamily) {
  if (typeof seed !== 'string' && !(typeof seed === 'number' && Number.isFinite(seed))) throw new TypeError('Invalid seed');
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid page or index');
  const key = JSON.stringify([seed, pageNumber, index, 'font']);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  let choice = hash % FONT_FAMILIES.length;
  if (FONT_FAMILIES[choice] === previousFamily) choice = (choice + 1) % FONT_FAMILIES.length;
  return FONT_FAMILIES[choice];
}

/** Evaluate the specified pose equation without rounding; elapsed is seconds. */
export function angleAt({ period, angle }, elapsed) {
  finite(period, 'period');
  finite(angle, 'angle');
  finite(elapsed, 'elapsed');
  if (period <= 0 || elapsed < 0) throw new RangeError('period must be positive and elapsed nonnegative');
  // Reduce before multiplication to retain precision on long-lived clocks.
  return ((angle % 360 + 360 * ((elapsed % period) / period)) % 360 + 360) % 360;
}

/**
 * Scalar page clock. Defaults: not ready, permitted, visible, playing, speed 1.
 * new PageClock({ now: () => performance.now(), accumulatedSeconds: 0, ...conditions })
 * The injected source and explicit `now` arguments use the SAME monotonic ms
 * timeline. Methods return accumulated speed-scaled active seconds. Sampling
 * does not depend on frame count. Inactive/loading time never counts.
 *
 * setConditions(patch, now?) commits elapsed using the OLD state, then applies
 * the patch. Forced-static animationAllowed:false preserves user preferences.
 * stop(now?) sets ready:false; setConditions({ready:true}) resumes a visited page.
 * snapshot(now?) yields plain scalar state; restore via new PageClock({...state,
 * now}). Timestamps are deliberately omitted so restoration cannot catch up.
 * dispose(now?) freezes permanently and is idempotent. No animations are owned.
 */
export class PageClock {
  constructor({ now = () => performance.now(), accumulatedSeconds = 0, ...conditions } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    finite(accumulatedSeconds, 'accumulatedSeconds');
    if (accumulatedSeconds < 0) throw new RangeError('accumulatedSeconds must be nonnegative');
    validateConditions(conditions);
    this._now = now;
    this._elapsed = accumulatedSeconds;
    this._conditions = {
      speed: 1, userPaused: false, normalMode: false, hidden: false,
      ready: false, animationAllowed: true, ...conditions,
    };
    this._lastTime = finite(now(), 'now');
    this._disposed = false;
  }

  get running() {
    const c = this._conditions;
    return !this._disposed && c.ready && c.animationAllowed && !c.hidden && !c.normalMode && !c.userPaused;
  }

  /** Committed scalar time; use getElapsed() to include current running time. */
  get accumulatedSeconds() { return this._elapsed; }

  /** Monotonic start of the current uncommitted interval, or null when frozen. */
  get runningSince() { return this.running ? this._lastTime : null; }

  _time(now) {
    const time = finite(now === undefined ? this._now() : now, 'now');
    if (time < this._lastTime) throw new RangeError('now must not move backwards');
    return time;
  }

  getElapsed(now) {
    if (this._disposed) return this._elapsed;
    const time = this._time(now);
    if (this.running) this._elapsed += (time - this._lastTime) / 1000 * this._conditions.speed;
    this._lastTime = time;
    return this._elapsed;
  }

  setConditions(conditions, now) {
    if (this._disposed) throw new Error('PageClock is disposed');
    validateConditions(conditions);
    const elapsed = this.getElapsed(now);
    Object.assign(this._conditions, conditions);
    return elapsed;
  }

  stop(now) { return this.setConditions({ ready: false }, now); }

  snapshot(now) {
    return { accumulatedSeconds: this.getElapsed(now), ...this._conditions };
  }

  dispose(now) {
    if (!this._disposed) {
      this.getElapsed(now);
      this._disposed = true;
    }
    return this._elapsed;
  }
}
