# LetterSpinner

Local PDF reader that rotates each extracted Latin or Georgian letter at its own pace. See [SPEC.md](SPEC.md) for the behavior and support limits.

## Run

Install Node 24 and npm. In the project directory:

```sh
npm ci
npm run dev
```

Open the displayed localhost URL. Use the file picker or drop one PDF. No PDF bytes are uploaded. The PDF.js worker and app assets are served locally.

## Controls

Previous and Next change the displayed page. Pause freezes the current rotation; Resume continues it. Speed ranges from 0.25× to 2×. Normal text displays upright, selectable text. The reader honors the system reduced-motion preference.

Letters rotate at different speeds and become upright together every 12 seconds of active reading at 1× speed. The speed slider changes the time between alignments.

This version works best for selectable, single-column, horizontal left-to-right Latin or Georgian text. Scanned PDFs need OCR, which is not included. Complex layouts can be read out of order. PDFs are limited to 25 MiB and 1,000 pages. A page over 20,000 graphemes is rejected; pages over 5,000 spinning letters remain available in normal text.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

The build produces a static `dist` folder. Run `npm run preview` to check it locally.
