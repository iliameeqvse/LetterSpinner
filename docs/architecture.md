# Architecture

This guide describes the current prototype. [SPEC.md](../SPEC.md) describes the broader intended behavior and acceptance tests.

## Data flow

```text
Local PDF file
  → browser File API
  → PdfReader and PDF.js worker
  → text items for one page
  → buildPageModel (plain text, graphemes, warnings)
  → ReaderView and PageClock (accessible text and animated letters)
```

PDF bytes stay in the browser. `PdfReader` passes them to PDF.js and keeps the document open for navigation. It extracts a page when requested; the app does not draw the original PDF to a canvas.

## Modules

| File | Responsibility |
| --- | --- |
| `src/main.js` | Owns controls, status, document/page state, request guards, and a three-page text cache. |
| `src/pdf-reader.js` | Sets up the PDF.js worker, loads files, extracts text items, and destroys the document task. |
| `src/text-model.js` | Reconstructs text, normalizes it, segments graphemes, and decides whether a page can animate. No DOM dependency. |
| `src/spinner.js` | Produces stable letter speeds and tracks accumulated playback time per page. No PDF or DOM dependency. |
| `src/reader-view.js` | Renders text, creates and cancels rotations through the Web Animations API, and exposes one text copy to assistive technology. |
| `index.html`, `src/styles.css` | Screen structure and styling. |

`main.js` keeps up to three extracted `PageModel` objects in an LRU cache. It retains one small `PageClock` per visited page, so returning to a page restores its position in the cycle even after its text model has been evicted. Only the visible page has letter elements and animation objects.

## Text and motion

PDF.js returns text fragments, not guaranteed words. `buildPageModel` groups horizontal fragments by baseline, sorts them left to right, and inserts a space when the measured gap crosses a threshold. It joins physical rows into a reflowing text block, expands selected presentation ligatures, applies NFC normalization, and uses `Intl.Segmenter` to keep combining marks with their base letter.

Latin and Georgian graphemes can rotate. Pages containing another letter script, right-to-left or vertical text, or unsupported geometry use upright text. This conservative display rule does not guarantee correct extraction order. PDF-derived strings enter the DOM as text nodes, never as HTML.

By default, eligible letters make two, three, or four turns in a shared 12-second cycle. The user can choose an inclusive range from one to six turns per cycle; the minimum must stay below the maximum. Consecutive eligible letters get different periods. All begin at zero degrees, so all are upright at every 12-second boundary of accumulated page playback. Changing the turn range resets visited page clocks and restarts the active page upright. The global Speed control changes playback rate while preserving the current pose. The page clock advances only while its page is active, visible, and playing.

Each animated letter also receives a deterministic system font family from a five-family palette. Adjacent eligible letters use different families. The browser may substitute a font that is unavailable on the device; normal text uses the reader's ordinary font.

The animated visual layer is hidden from assistive technology, while one coherent plain-text copy is exposed. Normal mode displays that copy directly. Reduced motion forces upright text without changing the user's stored playback choice.

## Lifecycle and errors

Choosing a valid replacement PDF increments the document generation and clears the old reader. Each page request also has a generation. Asynchronous results check both values before changing the screen, so a slow earlier request cannot replace a newer one. Closing a PDF destroys its PDF.js task, cancels animations, and clears text and clocks.

The UI reports invalid files, password-required PDFs, size and page-count limits, empty text, extraction failures, and oversized page text. A page extraction error leaves navigation available and offers **Retry page**. The PDF is never written back or sent to an upload endpoint.

## Tests

`tests/unit/text-model.test.js` covers text reconstruction, Unicode, script support, and limits. `tests/unit/spinner.test.js` covers deterministic periods, shared alignment, clocks, and pause/speed behavior. `tests/e2e/reader.spec.js` opens a generated PDF in the browser and checks navigation, normal text, invalid-file recovery, pause/speed controls, and Georgian letter rendering.

These tests do not certify every PDF layout or the performance and manual accessibility targets in [SPEC.md](../SPEC.md).
