# Proposal

## Why

Phase 10 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the six reports of PRD §8. The roadmap and [ADR 0006](../../../docs/adr/0006-report-generation.md) both say to start with a time-boxed spike, D1 in [open-questions.md](../../../docs/open-questions.md). ADR 0006 picked pdfmake as the default without a headless browser, and named three risks the spike must settle before any report is built:

- whether our chart SVGs survive the PDF library's SVG conversion
- whether Japanese and Portuguese text renders, since PDF libraries don't fall back to system fonts
- how long a PDF of a large execution takes

It also left the library choice open between pdfmake and react-pdf. Phase 9 is now done, and `packages/reporting` writes static SVG for every chart type (ADR 0023). The spike can therefore test the real charts rather than mock-ups.

## What Changes

- **A throwaway spike harness** in `spikes/report-rendering/`. It has its own `package.json` outside the npm workspaces, so the root lockfile and the apps never see its dependencies. It imports the built `@railgun-qa/reporting`. For **pdfmake** and for **react-pdf** alike, it renders three sample documents:
  - **Charts:** every chart type, with one SVG per writer (line, donut, stacked bar, word cloud), drawn from realistic geometry
  - **Text:** a page of Japanese, Portuguese and English text: headings, a table, Gherkin in a monospace face, and a word cloud with Japanese and accented tag names
  - **Large execution:** an execution of 500 runs, each with a 12-line Gherkin script, plus 100 linked bugs and their failed steps. No images.
- **Measurements** for each library:
  - generation time (median of 5) and peak memory
  - file size, with and without the embedded Japanese font
  - a visual check of each chart against the same SVG opened in a browser
  - the work needed to bring our SVG into the library: pdfmake takes an SVG string; react-pdf needs our element subset mapped to its primitives
- **A findings write-up** with sample PDFs, presented as options plus a recommendation. The user decides, as the project's decision workflow requires.
- **The decision recorded** as ADR 0026, amending ADR 0006:
  - the library
  - the font strategy (family, weights, how it is embedded and subset)
  - any SVG subset rules the spike adds to ADR 0023
  - a time budget for the report job

  `open-questions.md` moves D1 to its resolved table, and ADR 0006 and ADR 0023 get "amended by" headers.
- **The harness is then deleted.** Its measurements and the commands that produced them are kept in the ADR.
- **Docs:** the roadmap's Phase 10 gets a Slice 1 entry pointing at this change.

## Capabilities

**No spec-level behaviour changes, so `skip_specs: true` is set in `.openspec.yaml`.** This change produces a decision and an ADR. No app, package or API changes what it does, and the spike code is removed before the change is archived.

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- **Code:** none kept. The `spikes/report-rendering/` folder, its `node_modules` and its outputs exist only while the spike runs. `packages/reporting` is used as is. If the spike finds an SVG feature that fails, the fix goes into the ADR as a rule, and into code in the first report slice, not here.
- **Dependencies:** none added to any workspace. The harness installs `pdfmake` and `@react-pdf/renderer` locally. It also needs a Noto Sans JP font file, downloaded into the harness and never committed.
- **Docs:** new `docs/adr/0026-…md`; amended headers on ADR 0006 and ADR 0023; `docs/open-questions.md` (D1 resolved); `docs/roadmap-full.md` (Phase 10 Slice 1).
- **Out of scope:**
  - images in reports, and D2's resize dimension and size caps: left open until attachments exist (Phase 8)
  - D3, retention of report files and signed links
  - headless Chromium as a third option: it stays ADR 0006's revisit alternative
  - building any report, the report job, storage or the Download buttons (later Phase 10 slices)
