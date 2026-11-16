import { createFontFamily } from './spinner.js';

export class ReaderView {
  constructor(root) { this.root = root; this.animations = []; }

  clear(message = '') {
    this.animations.forEach(a => a.cancel());
    this.animations = [];
    this.root.replaceChildren();
    if (message) { const p = document.createElement('p'); p.textContent = message; p.className = 'placeholder'; this.root.append(p); }
  }

  show(model, { normal, seed, elapsed, speed, playing, parameters, turnRange }) {
    this.clear();
    const plain = document.createElement('p');
    plain.className = 'reader-plain';
    plain.textContent = model.plainText;
    if (normal || !model.animationAllowed) { this.root.append(plain); return; }
    plain.classList.add('sr-only');
    this.root.append(plain);
    const visual = document.createElement('p');
    visual.className = 'reader-animated';
    visual.setAttribute('aria-hidden', 'true');
    this.root.append(visual);
    let word = null;
    let previousPeriod;
    let previousFamily;
    for (const grapheme of model.graphemes) {
      const value = grapheme.text;
      if (/\s/u.test(value)) {
        word = null;
        visual.append(document.createTextNode(value));
        continue;
      }
      if (!word) { word = document.createElement('span'); word.className = 'word'; visual.append(word); }
      if (!grapheme.eligible) { word.append(document.createTextNode(value)); continue; }
      const box = document.createElement('span'); box.className = 'letter-box';
      const inner = document.createElement('span'); inner.className = 'letter'; inner.textContent = value;
      const family = createFontFamily(seed, model.pageNumber, grapheme.index, previousFamily);
      inner.style.fontFamily = family;
      previousFamily = family;
      box.append(inner); word.append(box);
      const { period, angle } = parameters(seed, model.pageNumber, grapheme.index, previousPeriod, turnRange);
      previousPeriod = period;
      const animation = inner.animate([{ transform: `rotate(${angle}deg)` }, { transform: `rotate(${angle + 360}deg)` }], { duration: period * 1000, iterations: Infinity, easing: 'linear' });
      animation.pause();
      animation.currentTime = elapsed * 1000;
      animation.playbackRate = speed;
      if (playing) animation.play();
      this.animations.push(animation);
    }
  }

  sync({ elapsed, speed, playing }) {
    for (const animation of this.animations) {
      animation.pause();
      animation.currentTime = elapsed * 1000;
      animation.playbackRate = speed;
      if (playing) animation.play();
    }
  }
}
