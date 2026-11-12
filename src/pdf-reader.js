import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfReader {
  constructor() { this.task = null; this.document = null; }

  async open(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    this.task = pdfjs.getDocument({ data, stopAtErrors: true });
    this.document = await this.task.promise;
    if (this.document.numPages > 1000) throw new Error('PAGE_COUNT_LIMIT');
    return this.document.numPages;
  }

  async page(pageNumber) {
    if (!this.document || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.document.numPages) throw new RangeError('Invalid page');
    const page = await this.document.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: true });
    const viewport = page.getViewport({ scale: 1 });
    return { items: content.items, viewportTransform: viewport.transform, pageNumber };
  }

  async destroy() {
    const task = this.task;
    this.task = null;
    this.document = null;
    if (task) await task.destroy().catch(() => {});
  }
}
