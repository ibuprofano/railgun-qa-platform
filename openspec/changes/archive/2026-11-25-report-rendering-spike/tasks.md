# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, add a Phase 10 Slice 1 entry, "Rendering spike (D1) 🚧", pointing at the OpenSpec change `report-rendering-spike`, with the scope and out-of-scope list from proposal.md. Verify that it reads correctly and that every link resolves.

## 2. Harness

- [x] 2.1 Create `spikes/report-rendering/` (design.md decision 1):
  - its own `package.json` (private; `pdfmake`, `@react-pdf/renderer`, `react`, `tsx`)
  - a `.gitignore` for `node_modules/`, `out/` and `fonts/`
  - a README listing the font URLs and versions, and the commands

  Download Noto Sans JP (Regular and Bold, static TTF) and Noto Sans Mono into `fonts/`. Verify that `npm install` inside the folder leaves the root `package-lock.json` unchanged (`git diff --quiet package-lock.json`), and that `npm run build -w packages/reporting` has produced the `dist/` the harness imports.
- [x] 2.2 Write `fixtures.ts` (design.md decision 2):
  - the four chart geometries and their SVGs, through `packages/reporting`'s writers with the print palette
  - the English, Portuguese and Japanese text samples
  - the large-execution data at 100, 250 and 500 runs

  Write each SVG to `out/*.svg`. Verify that the four SVG files open in a browser and look as on the dashboards.

## 3. pdfmake

- [x] 3.1 Render the charts, text and large-execution documents with pdfmake, registering the fonts in its virtual file system and passing each chart as an `svg` node (design.md decision 3). Find out whether the SVG `font-family` can be mapped to a registered font; if not, render the charts with `SvgPalette.fontFamily` set to the registered name. Verify that three PDFs are written to `out/pdfmake-*.pdf`.
- [x] 3.2 Grade pdfmake's output (design.md decision 4):
  - each chart against its browser SVG: matching, minor difference (named, with a screenshot) or broken
  - every glyph in every sample, the cloud's Japanese tags included
  - the three monospace options of design.md decision 5

  Record the grades in `out/findings.md`.

## 4. react-pdf

- [x] 4.1 Write `svg-to-react-pdf.tsx`, which maps our SVG subset to react-pdf primitives, and a variant that builds the primitives from geometry (design.md decision 3). Record each one's line count. Render the same three documents with `Font.register` for the same fonts. Verify that three PDFs are written to `out/react-pdf-*.pdf`.
- [x] 4.2 Grade react-pdf's output the same way as 3.2, including how the 500-row table breaks across pages, and add it to `out/findings.md`.

## 5. Benchmark

- [x] 5.1 Write `bench.cjs`, a CommonJS entry that loads each library through `require()` as the worker does. For 100, 250 and 500 runs, it measures the median time of 5 runs after a warm-up and the peak RSS sampled every 50 ms. It also measures each PDF's size, Latin-only against one Japanese line added, to confirm font subsetting (design.md decision 4). Run it with Node 24 and `--expose-gc`. Verify that it prints one table per library, and copy the tables into `out/findings.md` with the machine, Node and library versions.

## 6. Decision

- [x] 6.1 Apply design.md decision 6 to the findings and present them to the user: the grades, the timings, the adapter sizes, the font and monospace results, and a recommendation (or, if neither library passes, headless Chromium as the option to decide). Verify that the user has chosen the library, the font strategy and the job's time budget.
- [x] 6.2 Write `docs/adr/0026-report-rendering-library-and-fonts.md` (design.md decision 7):
  - the measurements table with hardware and versions
  - the decision and its rationale, and the alternatives with the numbers that ruled them out
  - the font files and the monospace strategy
  - the job's time and memory budget
  - any rules for the SVG writers
  - the commands that produced the numbers

  Add "amended by ADR 0026" to ADR 0006's header (and to ADR 0023's if rules were added), and mark ADR 0006's spike and library Open Items as settled. Move D1 to `open-questions.md`'s resolved table. Verify that every link resolves.

## 7. Cleanup

- [x] 7.1 Delete `spikes/report-rendering/` (and `spikes/` if empty). Verify that `git status` shows no files under `spikes/`, that the root `package-lock.json` is unchanged, and that `npm run lint` and `npm run typecheck` still pass from the root.
- [x] 7.2 In the roadmap's Phase 10 Slice 1 entry, record the outcome: the decision, the ADR link and the key numbers. Verify that it reads correctly.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 1 entry to ✅, and Phase 10's Remaining line to the report slices that follow.
