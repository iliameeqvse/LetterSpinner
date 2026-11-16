import { test, expect } from '@playwright/test';

function makePdf(lines) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${lines.map((_, i) => `${4 + 2 * i} 0 R`).join(' ')}] /Count ${lines.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let i = 0; i < lines.length; i++) {
    const pageId = 4 + 2 * i;
    const streamId = pageId + 1;
    const escaped = lines[i].replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
    const stream = `BT /F1 18 Tf 40 750 Td (${escaped}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('opens a PDF, animates letters, navigates, and switches to normal text', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: makePdf(['Hello spinning world', 'Second page']) });
  await expect(page.locator('#status')).toContainText('Page 1 ready');
  await expect(page.locator('.reader-plain')).toHaveText('Hello spinning world');
  await expect(page.locator('.letter')).toHaveCount(18);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
  await page.locator('#normal').check();
  await expect(page.locator('.reader-plain')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.reader-plain')).toHaveText('Second page');
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await expect(page.locator('#status')).toHaveText('Choose a PDF to begin.');
});

test('rejects an invalid file and remains ready for a valid PDF', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await expect(page.locator('#status')).toContainText('not a readable PDF');
  await page.locator('#file').setInputFiles({ name: 'good.pdf', mimeType: 'application/pdf', buffer: makePdf(['Recovered']) });
  await expect(page.locator('.reader-plain')).toHaveText('Recovered');
});

test('pause and speed changes preserve letter pose', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'spin.pdf', mimeType: 'application/pdf', buffer: makePdf(['Spin']) });
  await expect(page.locator('.letter')).toHaveCount(4);
  const letter = page.locator('.letter').first();
  await page.getByRole('button', { name: 'Pause' }).click();
  const before = await letter.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(250);
  expect(await letter.evaluate(element => getComputedStyle(element).transform)).toBe(before);
  await page.locator('#speed').fill('1.5');
  expect(await letter.evaluate(element => getComputedStyle(element).transform)).toBe(before);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => letter.evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
});

test('Georgian letters spin and share an upright alignment', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { buildPageModel } = await import('/src/text-model.js');
    const { createParameters, ALIGNMENT_SECONDS } = await import('/src/spinner.js');
    const { ReaderView } = await import('/src/reader-view.js');
    const word = 'გამარჯობა';
    const model = buildPageModel([{ str: word, transform: [10, 0, 0, 10, 0, 80], width: 90, dir: 'ltr' }], [1, 0, 0, -1, 0, 100], 1);
    const view = new ReaderView(document.getElementById('reader'));
    view.show(model, { normal: false, seed: 123, elapsed: 0, speed: 1, playing: false, parameters: createParameters });
    const letters = [...document.querySelectorAll('.letter')];
    const initial = letters.every(letter => Math.abs(new DOMMatrix(getComputedStyle(letter).transform).b) < 1e-6);
    letters.forEach(letter => { letter.getAnimations()[0].currentTime = ALIGNMENT_SECONDS * 1000; });
    const aligned = letters.every(letter => {
      const matrix = new DOMMatrix(getComputedStyle(letter).transform);
      return Math.abs(matrix.a - 1) < 1e-6 && Math.abs(matrix.b) < 1e-6 && Math.abs(matrix.c) < 1e-6 && Math.abs(matrix.d - 1) < 1e-6;
    });
    view.clear();
    return { count: letters.length, initial, aligned, text: model.plainText };
  });
  expect(result).toEqual({ count: 9, initial: true, aligned: true, text: 'გამარჯობა' });
});

test('user chooses letter speed range and sees varied fonts', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'styles.pdf', mimeType: 'application/pdf', buffer: makePdf(['Different letters']) });
  await expect(page.locator('.letter')).toHaveCount(16);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('#min-turns').selectOption('4');
  await expect(page.locator('#max-turns')).toHaveValue('5');
  await page.locator('#max-turns').selectOption('6');
  const styles = await page.locator('.letter').evaluateAll(elements => elements.map(element => ({
    duration: element.getAnimations()[0].effect.getTiming().duration,
    font: getComputedStyle(element).fontFamily,
    transform: getComputedStyle(element).transform,
  })));
  assertStyles(styles);
  await expect(page.locator('#status')).toContainText('cycle restarted upright');
});

function assertStyles(styles) {
  expect(styles.length).toBe(16);
  expect(new Set(styles.map(style => style.font)).size).toBeGreaterThan(1);
  for (const style of styles) expect([2000, 2400, 3000]).toContain(style.duration);
  for (const style of styles) expect(style.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
}
