# ADR 0026: Report Rendering Library and Fonts

**Status:** Accepted
**Date:** 2026-11-25
**Amends:** [ADR 0006](0006-report-generation.md) (settles its spike, its library choice and its font risk), [ADR 0023](0023-chart-rendering.md) (adds rules for SVG text in reports)

## Context

[ADR 0006](0006-report-generation.md) chose server-side PDF generation without a headless browser, with pdfmake as the default and react-pdf as the alternative. It left three risks to a time-boxed spike (open question D1) before any report is built:

- whether our chart SVGs survive the library's SVG conversion
- whether Japanese and Portuguese text renders, since PDF libraries don't fall back to system fonts
- how long a PDF of a large execution takes

The spike ran as the OpenSpec change `report-rendering-spike`, in a throwaway harness outside the npm workspaces. For each library it rendered three documents from the same fixtures:

- **Charts:** one SVG from each of `packages/reporting`'s writers (line, donut, stacked bar, word cloud), with Japanese and accented tags in the cloud
- **Text:** English, Portuguese and Japanese headings, paragraphs, tables and Gherkin
- **Large execution:** 500 runs, each with a 12-line script, and 100 bugs. About one in ten names and scripts is in Japanese.

Each chart was compared by eye with the same SVG rasterised by resvg, and each PDF page was rasterised with mupdf for inspection.

## Measurements

Windows 10 Pro 10.0.19045, Node v24.14.1, pdfmake 0.3.15, @react-pdf/renderer 4.9.1 with react 19.3.1. Each row ran in its own child process from a CommonJS entry, as `apps/worker` loads modules; react-pdf is ESM-only and loaded through `require(esm)`. The median is of 5 renders after a first, cold render. Peak memory is `process.resourceUsage().maxRSS`.

| Library | Document | First render (ms) | Median (ms) | Peak RSS (MB) | Size (KB) |
|---|---|---:|---:|---:|---:|
| pdfmake | execution, 100 runs | 461 | 362 | 305 | 180 |
| pdfmake | execution, 250 runs | 720 | 613 | 321 | 291 |
| pdfmake | execution, 500 runs | 1212 | 1023 | 348 | 476 (123 pages) |
| pdfmake | execution, 500 runs, no mono CJK font | 1004 | 946 | 294 | 439 |
| pdfmake | charts | 160 | 106 | 174 | 31 |
| react-pdf | execution, 100 runs | 1657 | 2074 | 324 | 161 |
| react-pdf | execution, 250 runs | 4294 | 5683 | 405 | 243 |
| react-pdf | execution, 500 runs | 10029 | 13547 | 602 | 376 (140 pages) |
| react-pdf | charts | 253 | 42 | 156 | 32 |

**Fidelity:**

| Check | pdfmake | react-pdf |
|---|---|---|
| Line, donut, stacked bar, word cloud | all match the reference | all match, but only through `parseSvg` plus a 26-line mapper. `<Image>` of the SVG draws its text in Helvetica, with Japanese as garbage. |
| Glyphs (English, Portuguese, Japanese; body, tables, chart text) | all render | all render |
| Gherkin indentation | kept | leading spaces collapsed |
| Japanese line breaks | correct | adds a stray hyphen ("全角英数字-") even with hyphenation off |
| 500-row table across pages | header repeats (`headerRows`) | header repeats (`fixed` row) |

**Fonts:** both libraries subset embedded fonts. One Japanese line adds about 15 KB to a Latin page, not the 4.5 MB font. Noto Sans Mono CJK JP (16 MB) adds about 8% time and 37 KB at 500 runs.

## Decision

**Reports are rendered with pdfmake. Body and chart text use Noto Sans JP, Gherkin uses Noto Sans Mono CJK JP, and the report job has a 30-second timeout.**

1. **pdfmake**, as ADR 0006 proposed, is now confirmed. Chart SVG strings from `packages/reporting` are passed unchanged as `{ svg, width, font }`. pdfmake's font callback maps the SVG's `font-family` list to registered fonts, and falls back to the node's `font` when none matches.
2. **Fonts.** Two families are bundled with the worker:
   - **Noto Sans JP** (static OTF, Regular and Bold) for all body, table and chart text. It covers Latin, Portuguese and Japanese, so one family serves every locale the PRD lists.
   - **Noto Sans Mono CJK JP** (Regular) for Gherkin scripts and failed steps. It keeps a true monospace grid in every script, with Latin half-width and CJK double-width.

   Both are under the SIL Open Font License. The files come from `github.com/notofonts/noto-cjk` (`Sans/SubsetOTF/JP/`, `Sans/Mono/`). They are embedded subset, as both libraries do by default.
3. **Time and memory budget.** The report job has a **30-second timeout**. That is about 25 times the measured cold time for 500 runs (1.2 s, about 2.4 ms per run, linear), which leaves room for slower hosting. A 500-run job peaks at about **350 MB**, and the worker's report concurrency is set from that when hosting is chosen (E2).
4. **Rules for report rendering:**
   - **No remote fetching:** call `setUrlAccessPolicy(() => false)`, and limit `setLocalAccessPolicy` to the bundled font directory. pdfmake otherwise fetches remote URLs found in document sources.
   - **SVG text font:** every `svg` node passes `font: 'NotoSansJP'`. Charts keep `PRINT_PALETTE.fontFamily` unchanged, and the node's `font` is what renders.
   - **Script text** (Gherkin, failed steps) always uses the mono CJK family, never a Latin-only mono font, so no glyph is drawn blank.
5. **Writer fixes found by the spike**, to be done before the first report ships, in a change of their own:
   - **Word cloud widths:** `estimateWordWidth` assumes 0.6 em per character. East Asian wide characters are about 1 em, so Japanese tags overlap their neighbours, on screen as well as in print.
   - **Date axis:** the last x-axis label is centred on the plot's right edge and clipped. Print SVGs also show raw ISO dates where the screen shows "24 Nov".

   Both were fixed in the OpenSpec change `chart-writer-fixes`: widths by character class (1 em for East Asian wide characters), date ticks anchored to stay inside the plot, and short day labels in print.

## Alternatives Considered

- **react-pdf.** As of 4.9 it can read SVG strings through `@react-pdf/svg`, which removes ADR 0006's original objection. It was not chosen:
  - It was 13 times slower at 500 runs (13.5 s against 1.0 s), and slowed faster than linearly (2.1, 5.7, 13.5 s), with a 600 MB peak. On that trend it reaches the 30 s budget at roughly 800 to 900 runs.
  - It needs a mapper to set fonts on SVG text.
  - It collapses Gherkin indentation and hyphenates Japanese.
  - It would bring React and JSX into the worker.

  It was faster only on dashboard-sized documents, where both libraries take well under a second.
- **Noto Sans JP only.** This means one font file, but Gherkin loses its monospace alignment.
- **Split runs** (Noto Sans Mono for Latin, Noto Sans JP for CJK). This avoids the 16 MB file, but mixed lines lose column alignment, because the widths are 0.6 em and 1 em.
- **Headless Chromium.** Not measured. It remains ADR 0006's revisit alternative, and nothing in the spike called for it.

## Consequences

- The worker image grows by about 25 MB of fonts: two Noto Sans JP weights and the mono CJK file. Each PDF carries only the glyphs it uses.
- The first report slice adds `pdfmake` to `apps/worker`, bundles the fonts, and applies the rules in decision 4.
- Dashboard PDFs and the execution PDF share one font setup and one document-building path.
- D2 (image sizes and caps) and D3 (retention) stay open. Images were left out of the spike and wait for attachments (Phase 8).

## Revisit Triggers

- An execution report nears the 30 s timeout or the memory budget in production.
- A script pdfmake's fonts don't cover is added to the PRD's languages.
- The automated engine ships with Chromium (ADR 0006's trigger).

## Reproducing the measurements

The harness was deleted after this ADR, at the user's request. To rebuild it, make a folder outside the workspaces with its own `package.json` (`pdfmake`, `@react-pdf/renderer`, `react`, `tsx`), import `packages/reporting/dist`, and render the three documents described in Context. Then time them from a CommonJS entry, one child process per configuration, five renders after a cold one, reading `process.resourceUsage().maxRSS`. The spike's design is in `openspec/changes/archive/*-report-rendering-spike/design.md`.
