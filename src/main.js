import './styles.css';
import { PdfReader } from './pdf-reader.js';
import { buildPageModel } from './text-model.js';
import { createParameters, PageClock, ALIGNMENT_SECONDS } from './spinner.js';
import { ReaderView } from './reader-view.js';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','drop-area','filename','close','previous','next','retry','page-label','pause','speed','speed-value','min-turns','max-turns','normal','status','reader'].map(id => [id.replace('-', ''), $(id)]));
const view = new ReaderView(ui.reader);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let reader = null, documentGeneration = 0, pageGeneration = 0;
let count = 0, pageNumber = 0, model = null, busy = false;
let seed = 0, cache = new Map(), clocks = new Map();
let speed = 1, userPaused = false, normalMode = false;
let turnRange = { minTurns: 2, maxTurns: 4 };

function status(message) { ui.status.textContent = message; }
function clock() {
  if (!clocks.has(pageNumber)) clocks.set(pageNumber, new PageClock());
  return clocks.get(pageNumber);
}
function canAnimate() { return !!model?.animationAllowed && !normalMode && !motion.matches; }
function settle() {
  if (!pageNumber || !clocks.has(pageNumber)) return;
  clock().getElapsed();
}
function sync() {
  if (!model) return;
  const current = clock();
  current.setConditions({ speed, userPaused, normalMode, hidden: document.hidden, ready: !busy, animationAllowed: canAnimate() });
  view.sync({ elapsed: current.getElapsed(), speed, playing: current.running });
}
function controls() {
  ui.filename.textContent = reader ? ui.filename.textContent : 'No PDF selected';
  ui.close.disabled = !reader;
  ui.previous.disabled = !reader || busy || pageNumber <= 1;
  ui.next.disabled = !reader || busy || pageNumber >= count;
  ui.pagelabel.textContent = reader ? `Page ${pageNumber} of ${count}` : 'Page —';
  ui.normal.disabled = !reader || busy || !model || motion.matches || !model.animationAllowed;
  ui.normal.checked = motion.matches || (model && !model.animationAllowed) || normalMode;
  ui.pause.disabled = !reader || busy || !model || !canAnimate();
  ui.pause.textContent = userPaused ? 'Resume' : 'Pause';
  ui.speed.disabled = !reader || busy || !model;
  ui.speedvalue.textContent = `${speed.toFixed(2)}×`;
}
function errorText(error) {
  const name = error?.name || '';
  if (error?.message === 'PAGE_COUNT_LIMIT') return 'This PDF exceeds the 1,000-page limit.';
  if (name === 'PasswordException') return 'This PDF requires a password, which this version cannot open.';
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') return 'This file is not a readable PDF.';
  return 'Could not read the PDF. Try another file.';
}
function dispose() {
  documentGeneration++; pageGeneration++; settle(); view.clear();
  const old = reader; reader = null; model = null; count = 0; pageNumber = 0; busy = false;
  cache.clear(); clocks.forEach(c => c.dispose()); clocks.clear(); ui.filename.textContent = 'No PDF selected';
  controls();
  if (old) void old.destroy();
}
async function open(files) {
  if (files.length !== 1) { status('Choose one PDF at a time.'); return; }
  const file = files[0];
  if (!file || !file.size) { status('The selected file is empty.'); return; }
  if (file.size > 26214400) { status('PDFs must be 25 MiB or smaller.'); return; }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { status('Choose a PDF file.'); return; }
  dispose();
  const generation = documentGeneration;
  reader = new PdfReader(); busy = true; seed = crypto.getRandomValues(new Uint32Array(1))[0];
  ui.filename.textContent = file.name; status('Opening PDF…'); controls();
  try {
    count = await reader.open(file);
    if (generation !== documentGeneration) return;
    if (!count) throw new Error('EMPTY_DOCUMENT');
    await showPage(1);
  } catch (error) {
    if (generation !== documentGeneration) return;
    const message = errorText(error); dispose(); status(message);
  }
}
async function showPage(target) {
  if (!reader || target < 1 || target > count) return;
  settle(); if (pageNumber && clocks.has(pageNumber)) clock().stop(); view.clear('Loading page…'); model = null; busy = true;
  ui.retry.hidden = true;
  pageNumber = target; ui.reader.scrollTop = 0;
  const docToken = documentGeneration, pageToken = ++pageGeneration;
  status(`Loading page ${target}…`); controls();
  try {
    let next = cache.get(target);
    if (!next) {
      const raw = await reader.page(target);
      if (docToken !== documentGeneration || pageToken !== pageGeneration) return;
      next = buildPageModel(raw.items, raw.viewportTransform, target);
      cache.set(target, next);
      if (cache.size > 3) cache.delete(cache.keys().next().value);
    } else { cache.delete(target); cache.set(target, next); }
    if (docToken !== documentGeneration || pageToken !== pageGeneration) return;
    model = next; busy = false;
    if (!next.plainText) { view.clear('No extractable text on this page. OCR is not available.'); status('No extractable text on this page.'); }
    else if (next.staticReason === 'page-text-limit') { view.clear('This page exceeds the 20,000-character reading limit.'); status('Page text limit exceeded.'); model = null; }
    else {
      const staticMode = normalMode || motion.matches || !next.animationAllowed;
      view.show(next, { normal: staticMode, seed, elapsed: clock().getElapsed(), speed, playing: false, parameters: createParameters, turnRange });
      status(next.warnings?.length ? next.warnings.join(' ') : `Page ${target} ready. All letters align every ${ALIGNMENT_SECONDS} seconds at 1×.`);
      sync();
    }
    controls();
  } catch (error) {
    if (docToken !== documentGeneration || pageToken !== pageGeneration) return;
    busy = false; model = null; view.clear('Could not extract this page.');
    ui.retry.hidden = error?.code === 'UNSUPPORTED_BROWSER';
    status(error?.code === 'UNSUPPORTED_BROWSER' ? 'This browser lacks the text segmentation needed for this reader.' : 'Could not extract this page. Try again.'); controls();
  }
}
function redraw() {
  settle();
  if (model) view.show(model, { normal: normalMode || motion.matches, seed, elapsed: clock().getElapsed(), speed, playing: false, parameters: createParameters, turnRange });
  sync(); controls();
}
function changeTurnRange(changed) {
  let minTurns = Number(ui.minturns.value);
  let maxTurns = Number(ui.maxturns.value);
  if (minTurns >= maxTurns) {
    if (changed === 'min') maxTurns = minTurns + 1;
    else minTurns = maxTurns - 1;
  }
  ui.minturns.value = String(minTurns);
  ui.maxturns.value = String(maxTurns);
  turnRange = { minTurns, maxTurns };
  const scrollTop = ui.reader.scrollTop;
  settle();
  clocks.forEach(pageClock => pageClock.dispose());
  clocks.clear();
  if (model) {
    redraw();
    ui.reader.scrollTop = scrollTop;
    status('Letter speeds updated. The cycle restarted upright.');
  }
}
ui.file.addEventListener('change', event => { void open([...event.target.files]); event.target.value = ''; });
ui.droparea.addEventListener('dragover', event => { event.preventDefault(); ui.droparea.classList.add('dragging'); });
ui.droparea.addEventListener('dragleave', () => ui.droparea.classList.remove('dragging'));
ui.droparea.addEventListener('drop', event => { event.preventDefault(); ui.droparea.classList.remove('dragging'); void open([...event.dataTransfer.files]); });
ui.close.addEventListener('click', () => { dispose(); status('Choose a PDF to begin.'); });
ui.previous.addEventListener('click', () => void showPage(pageNumber - 1));
ui.next.addEventListener('click', () => void showPage(pageNumber + 1));
ui.retry.addEventListener('click', () => { ui.retry.hidden = true; cache.delete(pageNumber); void showPage(pageNumber); });
ui.pause.addEventListener('click', () => { settle(); userPaused = !userPaused; sync(); controls(); });
ui.speed.addEventListener('input', () => { settle(); speed = Number(ui.speed.value); sync(); controls(); });
ui.minturns.addEventListener('change', () => changeTurnRange('min'));
ui.maxturns.addEventListener('change', () => changeTurnRange('max'));
ui.normal.addEventListener('change', () => { normalMode = ui.normal.checked; redraw(); });
motion.addEventListener('change', redraw);
document.addEventListener('visibilitychange', () => { settle(); sync(); });
controls();
