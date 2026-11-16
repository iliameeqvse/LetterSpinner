# LetterSpinner

LetterSpinner reads PDFs with individually rotating Latin and Georgian letters. The repository now has a browser prototype, a Django API, and an Expo React Native mobile app. In both readers, letters meet upright every 12 seconds of active playback at 1× speed.

The [prototype specification](SPEC.md) describes the intended behavior and acceptance criteria. [Architecture](docs/architecture.md) explains the current code.

## Mobile app and Django API

The shared React Native frontend lives in [`mobile/`](mobile/). Expo builds it for Android, iOS, and desktop browsers. Django lives in [`backend/`](backend/) and serves both the API and the exported website. Follow the [mobile and website setup guide](docs/mobile.md). The frontend uploads a PDF to Django, which stores it temporarily and returns extracted page text. The older browser prototype below remains available as a separate, browser-only version.

To open the integrated website on a PC, first install the backend's Python dependencies as described in the [setup guide](docs/mobile.md). Then export the web build and start Django:

```sh
cd mobile
npm ci
npx expo export --platform web
cd ../backend
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Use the virtual environment's Python for the Django commands. Open <http://127.0.0.1:8000/>. The website uses Django and works at desktop and narrow screen widths. During local development, rerun the web export after changing the shared frontend. To check the complete flow with a running Django server, run `npm run smoke:web` from the repository root.

## Start

Install Node.js 24 with npm. In this directory, run:

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite, normally <http://127.0.0.1:5173/>. Keep the terminal open while reading. Press `Ctrl+C` to stop the server.

On Windows PowerShell, if the optional Node archive is already unpacked inside this workspace, you can use it without a system installation:

```powershell
cd C:\projects\LetterSpinner
$env:Path = (Resolve-Path '.\.tools\node-v24.22.3-win-x64').Path + ';' + $env:Path
& '.\.tools\node-v24.22.3-win-x64\npm.cmd' ci
& '.\.tools\node-v24.22.3-win-x64\npm.cmd' run dev
```

The `.tools` directory is local and is not included in the project. If it is absent, install Node 24 and use the first commands.

## Read a PDF

1. Choose one PDF with the file picker, or drag it onto the drop area.
2. Use **Previous** and **Next** to move between pages.
3. Choose **Slowest letters** and **Fastest letters** to set the range of rotations each letter makes in 12 seconds. Choose a minimum below the maximum; the other control adjusts automatically if needed. Changing this range restarts the cycle with all letters upright.
4. Use **Pause/Resume** to freeze or continue the letters. **Speed** ranges from 0.25× to 2× and changes the overall pace without moving letters abruptly.
5. Choose **Normal text** for upright, selectable text. Clear it to return to spinning. **Close PDF** clears the document.

Only the displayed page animates. Returning to a page restores its saved position in the cycle. Hidden-tab and loading time do not count. The system reduced-motion setting shows upright text automatically.

By default, letters make two, three, or four turns in a shared 12-second cycle. You can choose a range from one to six turns per cycle. Each animated letter also gets one of several system font families, with adjacent letters using different families. Installed fonts vary by device, so exact glyph shapes may differ. The letters meet upright at the end of each cycle. With a constant Speed setting, the time between alignments is `12 ÷ speed` seconds.

## Supported PDFs and limits

The reader works best with selectable, horizontal, single-column, left-to-right Latin or Georgian text. Mixed Latin and Georgian pages can spin. Spaces, digits, punctuation, and emoji stay still. Other letter scripts, right-to-left text, and rotated text use a plain-text fallback.

PDF text extraction is approximate. Columns, tables, equations, unusual spacing, and broken character mappings can produce incorrect reading order or characters. Images are omitted. Scanned or image-only pages need OCR, which this prototype does not have. Password-protected PDFs cannot be opened.

| Limit | Behavior |
| --- | --- |
| PDF over 25 MiB | File is rejected. |
| PDF over 1,000 pages | Document is rejected. |
| Page over 20,000 extracted graphemes | Page shows a limit message; navigation remains available. |
| Page over 5,000 eligible letters | Full text remains available upright, without animation. |

If a page does not spin, check that **Normal text** is off and that reduced motion is not enabled on your device. The status message explains when the page uses normal text. For **No extractable text**, try a PDF whose text can be selected in a standard viewer. If Georgian appears as replacement characters or wrong letters, the PDF font mapping may not allow accurate extraction.

## Develop and verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

`npm test` runs the text and animation unit tests. `npm run test:e2e` starts the development server and runs browser tests. If Chrome is installed, you can use it instead of Playwright's Chromium download by setting `LETTERSPINNER_CHANNEL=chrome` for that command; in PowerShell, run `$env:LETTERSPINNER_CHANNEL = 'chrome'` first.

`npm run build` writes the static site to `dist/`, and `npm run preview` serves that build locally. Opening `index.html` with `file://` is unsupported because the PDF.js worker needs a local server. The application uses plain HTML, CSS, JavaScript, and PDF.js; Vite is its development/build tool. There is no application backend or Django integration yet.
