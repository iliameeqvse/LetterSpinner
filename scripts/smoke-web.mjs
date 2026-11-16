import { chromium } from '@playwright/test';

function pdfWithText(text) {
  const content = `BT /F1 18 Tf 40 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const browser = await chromium.launch({ channel: process.env.LETTERSPINNER_CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.LETTERSPINNER_WEB_URL || 'http://127.0.0.1:8000/');
  await page.getByText('LetterSpinner', { exact: true }).waitFor();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose PDF' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'desktop.pdf', mimeType: 'application/pdf', buffer: pdfWithText('Hello desktop') });
  await page.getByText('Page 1 of 1', { exact: true }).waitFor({ timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('The narrow layout has horizontal overflow.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Django-served website loaded and PDF upload/page reading worked.');
} finally {
  await browser.close();
}
