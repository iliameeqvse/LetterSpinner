# LetterSpinner — prototype specification v1

Status: ready for implementation. This document specifies the local tool only.
Date: 2026-11-12.

## 1. Objective and scope

A user selects or drops a local PDF and reads its extracted text with individual letters rotating at different speeds around their own centers.

The deliverable is a locally served browser application using plain HTML, CSS and JavaScript. It has no Django application, UI framework, database, accounts, upload endpoint or public deployment. PDF processing runs in the browser. The original PDF is never modified; the output is an animated reading view, not an animated PDF export.

The reference image was not available for inspection. The v1 interpretation is clockwise 2D rotation around each character's layout-box center. Words stay in place. Orbiting, wobbling and 3D flipping are out of scope.

This tool makes no claim that rotation improves memory. Learning-effect experiments are outside this implementation.

## 2. Supported input and explicit limits

- Primary support: selectable, horizontal, single-column, left-to-right Latin or Georgian text, including accented Latin characters, digits and punctuation.
- Output uses a consistent font and reconstructed text order; it does not reproduce original PDF fonts, images, page geometry, tables, columns or semantic headings.
- OCR, password entry, handwriting recognition, equation reconstruction, hyperlinks, annotations, embedded scripts and attachment execution are excluded.
- PDFs requiring a password are rejected. Image-only or blank pages show an empty-text message; do not claim that every empty-text page is a scan.
- Other scripts may be shown in normal-text mode, but their extraction fidelity is not guaranteed. Pages containing RTL text or letters outside Latin and Georgian must not animate individual glyphs, because splitting them may break shaping.
- Multi-column reading order is not guaranteed. Show a persistent concise scope note; do not pretend that complex layouts can be detected reliably.
- One file at a time; reject multi-file selections/drops without replacing the current document.
- File limit: 25 MiB (26,214,400 bytes). Page-count limit: 1,000. Both are inclusive.
- Page limit: 20,000 graphemes of normalized extracted text. Above that, show a page-level limit message and retain navigation; never silently truncate.
- Animation limit: 5,000 eligible graphemes on a page. Larger supported pages remain readable in normal-text mode with an explanation.
- These are product limits to be validated, not claims that every PDF inside them is cheap to parse.

## 3. Local runtime and delivery

Runtime: ES modules, PDF.js from pdfjs-dist, browser Web Animations API, Intl.Segmenter, local system fonts. If required browser APIs are absent, show an unsupported-browser message; do not fall back to splitting UTF-16 code units. PDF.js must parse in its worker; do not silently fall back to main-thread parsing.

Use Vite solely for serving and bundling the vanilla application. Use Node's test runner for pure logic and Playwright for browser integration. No React, Vue, component library or application server.

At implementation time, select compatible stable package versions, commit package-lock.json, pin the Node runtime in .nvmrc and document it in README.md. PDF.js main code and worker must come from exactly the same installed package version. Bundle/serve any required PDF.js font, CMap or WASM assets locally; no CDN or remote font requests.

Required commands after installing the documented Node version:
- npm ci
- npm run dev — binds to 127.0.0.1
- npm test — pure logic tests
- npm run test:e2e — browser checks; document one-time browser installation
- npm run build — creates a static dist directory
- npm run preview — serves that build on 127.0.0.1

Opening index.html using file:// is not a supported launch method. No public hosting is part of v1.

Acceptance platform: Windows desktop, current stable Chrome and Edge at implementation time. Record tested versions. Layout must remain usable at 360 CSS pixels wide and at 200% browser zoom. Other browsers are best effort.

## 4. User interface and controls

A single screen contains:
1. Title and short explanation.
2. Drop area and native file-picker button, accessible even when a document is already open.
3. File name, "Page X of Y", Previous, Next and Close PDF.
4. Pause/Resume, a speed slider with numeric value, Slowest letters and Fastest letters selectors, and a Normal text checkbox.
5. Status/error area.
6. Reading area for one page.

Defaults: spinning mode, playing, speed 1.00x, and two to four turns per 12-second cycle. The user can choose a slowest value from one to five turns and a fastest value from two to six turns, with slowest strictly below fastest. Speed ranges from 0.25x–2.00x in increments of 0.05x. All eligible letters become upright together every 12 seconds of active playback at 1x, or every 12/speed seconds at another constant speed.

- Initial state: reader empty; document controls disabled.
- Previous/Next: disabled at boundaries and while a page is loading.
- File selection and Close PDF remain available during loading.
- Pause freezes the current pose; it does not straighten letters.
- Normal text shows upright, unfragmented text and permits ordinary selection/copy. Unchecking it restores the saved animated pose.
- Pause/Resume is disabled while normal mode or another forced-static condition applies, but its underlying user choice is retained.
- Speed remains editable when a readable page exists, including while paused or static; edits affect the next animated playback.
- Changing the turn range restarts all visited page clocks at zero and immediately redraws the active page upright. If a selector would make the range invalid, adjust the other selector to retain at least two available rates.
- Navigation resets the reading area's scroll to the top. Mode changes retain scroll position, clamped to the new content height.
- A successfully selected replacement starts on page 1 and clears old page clocks/cache. Global speed, pause and mode choices survive document replacement within the tab session.
- Close PDF cancels work and clears file content/state. Global controls retain their values for the next file.
- No settings or document data persist across reload.

Use native labeled controls, visible focus, and a polite live status region. Errors are announced once. Animation frames are never announced. Switching pages does not steal focus from navigation controls.

The animated visual layer is hidden from assistive technology; expose one coherent text representation instead. In normal mode the visible text is that accessible representation. There must never be two screen-reader copies of the page.

If prefers-reduced-motion is enabled, force upright normal text from the first render. A preference change during playback takes effect immediately. Show why animation is unavailable, disable the mode toggle while forced, and preserve user choices for when the preference changes back.

## 5. Document and page lifecycle

Track document state: empty, loading, ready, error.
Track active-page state independently: loading, ready, no-text, unsupported-for-animation, over-limit, error.

1. Validate selection count, nonzero size, size cap and PDF candidacy (.pdf extension or application/pdf MIME type). PDF.js parsing determines whether the content is actually a valid PDF.
2. A pre-validation failure leaves the current document intact and shows a selection error.
3. Once validation passes, freeze and clear the old reader, invalidate its requests, cancel animations and destroy its PDF.js task/document before activating the replacement.
4. Read local bytes, pass them to getDocument, inspect page count, then fetch page 1 text.
5. Retain the PDF document proxy for navigation. Extract only a requested page; do not eagerly extract the whole document.
6. Use separate monotonically increasing document-generation and page-request identifiers. Check both after every asynchronous boundary. Stale results and stale errors cannot change UI, caches or status.
7. On page navigation, snapshot the old page clock, cancel/detach all its animations, clear its DOM, then load the target page. Loading time never counts as animation time.
8. Cache at most three extracted PageModel values using least-recently-used eviction. Retain small scalar clocks for visited pages until the document closes. Eviction must not change a revisited page's animation parameters.
9. Empty, unsupported or failed pages retain navigation when a document is valid. A page extraction failure offers Retry page. A document load failure returns to a recoverable state with file selection available.
10. Destroy PDF.js workers/tasks and drop byte buffers, caches, animation handles and old DOM references on document replacement/close. Use PDF.js cleanup only when a page has no pending operation.

Messages must distinguish invalid PDF, password required, file/page-count limit, page-text limit, no extractable text, worker/load failure and page extraction failure. Never display a raw stack trace as the user message. Do not log PDF contents.

## 6. Text reconstruction contract

Use getDocument with local Uint8Array data and stopAtErrors: true. Treat the byte buffer as transferred to the worker. Fetch the selected page using one-based indexing and call getTextContent with includeMarkedContent: false and disableNormalization: true. No canvas rendering or PDF.js text layer is required.

PDF text items are fragments, not words. Implement the following deterministic heuristics for supported pages:
1. Ignore marked-content entries. Preserve original item indices for stable tie-breaking. Validate geometry as finite numbers.
2. Convert text-item transforms into scale-1 viewport coordinates, accounting for page rotation. Derive baseline origin, advance along the text axis and nominal font size from the transformed axes.
3. For horizontal LTR items, group by baseline top-to-bottom. Assign each fragment to the nearest row within max(1, 0.25 * min(itemSize, rowSize)) viewport units; otherwise create a row. Retain the row's first baseline and size. Resolve equal distances by earlier row creation.
4. Sort rows top-to-bottom and fragments left-to-right within each row, with original index as tie-breaker.
5. Preserve explicit spaces, collapsing runs to a single space. Between fragments without boundary whitespace, insert a space only if the horizontal gap exceeds 0.2 * min(adjacent nominal sizes). Otherwise concatenate. Fragment boundaries alone never imply a space.
6. Trim rows, discard empty rows and join them with one space into one reflowing block per page. hasEOL is a line hint, not evidence of a paragraph. Do not infer headings or paragraphs.
7. Keep punctuation and visible hyphens. Never silently dehyphenate: a line ending in "inter-" followed by "national" becomes "inter- national".
8. Expand only U+FB00–U+FB06 presentation ligatures to ff, fi, fl, ffi, ffl, st, st. Apply NFC after joining fragments. Do not apply blanket NFKC.
9. Segment the complete normalized string with Intl.Segmenter using grapheme granularity. Spaces are separate static tokens. Combining accents remain attached to their base letters.
10. A rotating grapheme contains a Latin or Georgian letter and no letter from another script. Digits, punctuation, symbols, emoji and whitespace remain stationary. If another script's letter exists on the page, force normal mode for the whole page. Unicode Script_Extensions=Latin or Script_Extensions=Georgian determines membership; combining marks remain attached and are not independently classified as letters.

For RTL, vertical or text rotated more than 2 degrees away from the positive horizontal axis after viewport conversion, use a clearly labeled normal-text fallback: concatenate source-order item strings, using hasEOL to add line breaks and applying the same normalization. Do not claim reliable reading order. Nonfinite/invalid geometry uses this same fallback if text exists.

PDF.js whitespace normalization means original tabs and nonbreaking spaces cannot be recovered. If extracted text contains U+FFFD, display a "Some characters could not be decoded" notice. Other incorrect character mappings may not be detectable.

Every PDF-derived string enters the DOM through textContent or text nodes. Never interpret extracted content as HTML.

## 7. Letter layout and animation contract

Use a system sans-serif font at 24 CSS pixels, a 1.8 line-height and a reading-area maximum width of 80 characters. These values are defaults, not a promise of identical metrics across machines. Use responsive horizontal padding.

Each eligible grapheme has a stationary outer layout box and an inner rotating element. Rotation uses transform-origin: center center and does not affect line measurement. Add 0.05em inline padding to rotating boxes. Keep overflow visible and allow vertical clearance; some long graphemes may still overlap at intermediate angles, which must be assessed visually.

Group ordinary non-whitespace sequences into word containers. Wrap at spaces; allow emergency grapheme-boundary wrapping for a word wider than the reading area. Normal mode renders plain text without letter wrappers. Its line breaks may differ from animated mode.

For each eligible grapheme i:
- Assign a whole number of full rotations within a shared 12-second cycle from the user's inclusive range. The default is two, three or four rotations; the full selectable range is one through six. The base period T_i = 12/turns seconds and start angle A_i = 0 degrees.
- Generate parameters with a deterministic seeded PRNG from a per-document session seed, page number and grapheme index. Store the session seed until close. Re-extraction, resize, toggles and revisits must produce the same parameters.
- Adjacent eligible graphemes must have different periods. Global uniqueness is unnecessary. Do not reseed at each frame.
- Give each animated grapheme a stable font family from a system-font palette, with adjacent eligible graphemes using different families. Fonts are allowed to fall back according to availability. Normal-text mode uses the reader's ordinary font.
- Define angle_i = (360 * E_page / T_i) mod 360. At E_page = 0, 12, 24, ... seconds, every eligible letter is upright.
- E_page is accumulated speed-scaled active time in seconds, initially zero for each page.
- Rotation is clockwise, linear and infinite.

The page clock advances only when the page is ready, spinning is permitted, the tab is visible, normal mode is off and the user has not paused. At a transition, first accumulate elapsed monotonic time with the previous speed, then apply the new state. Never use wall-clock dates or frame count for elapsed time.

Consequences:
- Pause/resume and speed changes preserve pose.
- Changing speed while paused does not rotate letters.
- Inactive pages freeze. Revisiting restores their saved pose before playback resumes.
- Loading and hidden-tab time do not count; there is no catch-up spin.
- Normal mode temporarily displays upright text while preserving the frozen animation clock.
- Forced static modes do not overwrite user playback or display preferences.

Use the Web Animations API for transform playback, with each animation's position derived from the page clock. Rate changes must preserve phase; use updatePlaybackRate and coordinate transitions so the last slider value wins. Restore time before revealing recreated animations. Do not change CSS duration to implement the slider.

The scalar page clock is the source of truth. Cancel animation objects on unmount; inactive pages retain no animation objects or DOM. Do not allocate permanent compositor layers for every glyph using blanket will-change.

## 8. Module boundaries and data contracts

Planned source layout:
- index.html — screen shell and controls.
- src/main.js — wiring only.
- src/controller.js — document/page state, asynchronous generations and transitions.
- src/pdf-reader.js — PDF.js worker setup, loading, extraction and disposal.
- src/text-model.js — reconstruction, normalization, segmentation and support classification.
- src/spinner.js — parameter generation, page clock and animation lifecycle.
- src/reader-view.js — text/animated DOM and accessible representation.
- src/styles.css — layout, controls, readable text and rotation boxes.
- tests/unit/ and tests/e2e/ — focused verification.
- tests/fixtures/ — small self-authored PDFs and expected text.
- README.md, package.json, package-lock.json and required tool configuration.

Modules communicate through plain data:
- RawPage: pageNumber, text items, viewport transform.
- PageModel: pageNumber, plainText, ordered graphemes with index and animation eligibility, warnings, animationAllowed, staticReason.
- DocumentSession: generation, PDF handle, session seed, page count, active page, three-entry text cache and visited-page clocks.
- PlaybackPreferences: speed, userPaused, normalMode.
- PageClock: accumulatedSeconds and optional runningSince monotonic timestamp.

Only pdf-reader imports PDF.js. text-model contains no DOM or PDF.js imports; it accepts plain extracted fields. spinner does not know about files, PDF.js or Django. reader-view does not load files. This separation permits later embedding without defining Django routes or storage now.

Each subsystem has an explicit disposal operation. Controller owns document and page lifetimes and is responsible for ignoring stale results.

## 9. Acceptance tests

| ID | Required outcome |
| --- | --- |
| A01 | Picker and drag/drop open the same supported PDF, show its filename/page count and display expected text. |
| A02 | Split fragments "Hel" and "lo" concatenate; a gap above the specified threshold before "world" yields "Hello world". Exercise threshold boundaries with pure-data tests. |
| A03 | Two physical lines join with one space; explicit repeated spaces collapse; line-end hyphens remain. No automatic paragraph inference occurs. |
| A04 | Presentation ligatures expand; decomposed accented Latin becomes an intact grapheme; Georgian letters spin in pure or mixed Latin/Georgian text; emoji and digits remain intact and stationary. Other scripts and RTL use the specified static fallback. |
| A05 | On a known paragraph, adjacent letter periods differ and remain within the selected turn range. With the defaults, periods are 3, 4 or 6 seconds at 1x. Every eligible letter is upright together at 0, 12 and 24 accumulated seconds; adjacent eligible letters have different assigned font families. |
| A06 | Pause for at least one second changes clock/angles by zero; resume continues. Compare model time exactly and rendered angles with a 2-degree tolerance after settling. |
| A07 | Changing speed while running preserves the instantaneous logical angle and changes subsequent angular velocity. While paused, changing speed leaves the pose unchanged. Rapid changes settle at the final selected value. |
| A08 | Normal mode provides coherent selectable text; switching back restores the saved pose. Page and scroll position are retained as specified. |
| A09 | Previous/Next boundaries work. Returning to a visited page, including after text-cache eviction, restores parameters and saved time. Only one page has animation objects. |
| A10 | Tab hiding and loading freeze time. Returning causes no accumulated hidden-time jump. Reduced-motion preference starts static and responds to changes without losing user choices. |
| A11 | Empty, image-only, corrupt, password-required, zero-byte, over-size and excessive-page-count inputs show distinct applicable outcomes. Limits are checked at and immediately above their inclusive boundaries. No error prevents a subsequent valid load. |
| A12 | A page above 20,000 graphemes reports its limit without truncation; a page with over 5,000 eligible letters but within the text cap shows full normal text and retains navigation. |
| A13 | Delayed document A cannot overwrite newer document B or publish a stale error. Closing during load leaves the reader empty. Verify page-generation guards with controlled delayed promises. |
| A14 | Replacement/close cancels animation objects and destroys abandoned PDF.js work. Repeated loading/navigation does not accumulate attached readers or active workers. Text cache never exceeds three entries. |
| A15 | All controls work by keyboard with visible focus. A screen reader receives one coherent page representation and status changes, not letters/frames. Width 360px and zoom 200% keep controls usable. |
| A16 | Extracted HTML-like strings display literally. Network inspection of the production preview shows no external requests or document uploads during file loading/navigation. Loading a PDF does not initiate network requests to links embedded in it. |

Fixtures must include: self-authored single-column PDF with known text; multipage PDF; fragmented words and spacing boundaries; Latin/Georgian text, accents/ligatures/emoji/digits; blank and image-only pages; corrupt and password-required files; RTL/other-script and rotated text; complex columns as a documented fidelity limitation; two documents for load races; and a dense/long document. Generate boundary-size/model cases when practical rather than checking large binaries into the repository.

Performance targets, measured on a documented Windows reference machine with browser version, CPU and RAM recorded:
- A local <=1 MiB, <=10-page supported fixture with <=3,000 graphemes on page 1 reaches readable state within 2 seconds.
- A cached page transition finishes within 250 ms.
- During playback of 3,000 rotating letters, Pause responds within 100 ms.
- Record first-load latency and animation frame-time observations for 5,000 letters; do not assert a universal 60 fps guarantee.

Measure five warm runs after an initial application warm-up and report the median, including the fixture name. If targets fail, report the failure and optimize or explicitly revise the specification; do not claim unmeasured performance. Browser end-to-end checks cover Chromium; run a manual smoke test in installed Edge and a manual screen-reader check.

## 10. Implementation sequence and completion gate

1. Scaffold the vanilla application and local tooling. Establish the worker/asset path and production build.
2. Implement and test text reconstruction and deterministic animation clocks as independent modules.
3. Build a sample-paragraph reader to verify rotation, controls and readable mode.
4. Connect PDF loading, extraction, page navigation, request guards, cache and disposal.
5. Add error states, static fallbacks and accessibility behavior.
6. Run unit/browser tests, manual visual/accessibility checks and performance measurements. Document commands and actual limitations.

Done means the static production build runs locally, A01–A16 pass, performance outcomes are recorded against their targets, and README explains setup, support boundaries and controls. No feature is complete merely because a mock paragraph spins.

Django integration, uploads/storage, user accounts, saved documents, exact PDF layout, OCR, animated exports, memory studies and public deployment require a subsequent specification.

## 11. Review record and technical references

Specification sidecar reviews were delegated as requested:
- GPT-6.1 Sol, high reasoning: PDF extraction, Unicode boundaries and document lifecycle.
- GPT-6.1 Sol, medium reasoning: animation phase, controls and accessibility.
- GPT-6 Luna, medium reasoning: user-visible acceptance cases and fixtures.

The primary agent reconciled their proposals into this specification. Their tasks were specification reviews; no application implementation or deployment was requested from them.

References:
- [PDF.js loading and text types](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- [PDF.js page extraction](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)
- [PDF.js loading-task disposal](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html)
- [Phase-preserving playback-rate updates](https://developer.mozilla.org/en-US/docs/Web/API/Animation/updatePlaybackRate)
- [Grapheme segmentation specification](https://tc39.es/ecma402/#sec-intl.segmenter)
- [Vite tooling](https://vite.dev/guide/)
- [W3C pause, stop and hide guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
