# Design

## Context

See proposal.md, Why. These facts shape the spike:

- **Charts:** `packages/reporting/src/charts/svg.ts` writes static SVG for the line, donut, stacked bar and word cloud charts. It uses only `svg`, `g`, `line`, `path`, `rect`, `text` and `circle`, with flat fills (ADR 0023). Text carries `font-family="Helvetica, Arial, sans-serif"` (`PRINT_PALETTE`) and `text-anchor`. Colours are hex in print. The geometry functions are pure and take explicit sizes.
- **pdfmake** draws an `svg` node from an SVG string, converted by `svg-to-pdfkit` onto PDFKit. Fonts are only those registered in its virtual file system. It has no per-glyph fallback, so a glyph missing from the active font is drawn blank.
- **react-pdf** (`@react-pdf/renderer`) renders React elements to PDF with its own layout engine. It has `Svg`, `G`, `Path`, `Rect`, `Line`, `Circle` and `Text` primitives, but nothing that takes an SVG string (ADR 0006, Alternatives). Fonts come from `Font.register`, also without fallback.
- **The worker** (`apps/worker`) is CommonJS loading ESM through `require(esm)`, on Node ≥ 22.18 (the machine runs 24). Whichever library wins must load there, which the spike checks with the worker's own Node.
- **Locales:** the PRD's language list (§7.2) includes Japanese and Portuguese. Tag names, test case names, Gherkin and bug text are user input in any script.
- **The decision workflow** (CLAUDE.md): present options and a recommendation, get a decision, then record it as an ADR and update `open-questions.md`.

## Goals / Non-Goals

**Goals:**
- **Evidence for one library choice,** using the real chart writers, real-shaped data and the worker's runtime.
- **A font strategy** that renders Japanese and Portuguese everywhere a report shows user text, charts included.
- **A time and memory budget** for the report job, from a large execution.

**Non-Goals:**
- Report layouts or design. The sample documents only need to exercise the risks.
- Images, size caps and retention (D2, D3).
- Production code. Nothing from the harness is imported by any app or package.

## Decisions

### 1. A standalone harness outside the workspaces
`spikes/report-rendering/` has its own `package.json`, with `"private": true` and no `workspaces` entry. Since the root `workspaces` globs are `apps/*` and `packages/*`, `npm install` there never touches the root lockfile. It depends on `pdfmake`, `@react-pdf/renderer`, `react` and `tsx`, and imports `@railgun-qa/reporting` by relative path to its built `dist/`.
- **Scripts:** `npm run pdfmake`, `npm run react-pdf` and `npm run bench`. Each writes into `spikes/report-rendering/out/` (gitignored).
- **Fonts:** downloaded to `spikes/report-rendering/fonts/` (gitignored):
  - Noto Sans JP, static TTF Regular and Bold
  - Noto Sans Mono, Regular

  The README records their URLs and versions.

**Why outside the workspaces:** the user chose to delete the spike afterwards. A separate install keeps both libraries out of every lockfile and `node_modules` that ships, so deleting the folder deletes everything.

### 2. Three sample documents, built from shared fixtures
`fixtures.ts` builds the inputs once, so both libraries render identical content:
- **Charts:** one geometry per writer from `packages/reporting`:
  - a 30-day line with two series
  - a donut with four parts
  - a stacked bar with three series
  - a word cloud with 8 tags, 3 of them Japanese (`決済`, `認証`, `モバイル`) and 1 with accents (`integração`)

  Each SVG is also written to `out/*.svg` to open in a browser as the reference.
- **Text:** a heading, a paragraph and a 6-row table in each of English, Portuguese (`ação`, `não`, `€`) and Japanese, plus a Gherkin block in Japanese and in English.
- **Large execution:** metadata, then 500 runs (name, outcome, 12-line Gherkin) and 100 bugs with title, severity and failed step. The names are deterministic, with about one in ten in Japanese.

**Why 500 runs:** the PRD sets no run limit per execution. 500 is above anything the demo seed or a manual team is likely to run, and the bench also reports 100 and 250 runs, so the time can be read as a trend rather than a single point.

### 3. Bringing our SVG into each library
- **pdfmake:** the SVG string goes in as `{ svg, width }`. The spike checks:
  - `text-anchor="middle"` and `end`
  - path arcs from the donut
  - opacity
  - `font-family` mapping

  `svg-to-pdfkit`'s font callback is checked to see whether pdfmake exposes it. If it doesn't, the fallback is to write the registered family name (for example `NotoSansJP`) into the SVG through `SvgPalette.fontFamily`. That is already a parameter, so no geometry changes.
- **react-pdf:** a small adapter (`svg-to-react-pdf.tsx`) parses our SVG string and maps each element of the subset to its primitive. The subset is closed (ADR 0023), so this is about 60 lines. The spike records its size as part of react-pdf's maintenance cost. A second variant builds the primitives from geometry directly, to see whether that is simpler than parsing.

### 4. What is measured, and how
- **Time:** wall-clock time from the document definition to the finished `Buffer`, median of 5 runs after one warm-up, on Node 24 with `--expose-gc`, through `require()` from a CommonJS entry (as the worker loads modules).
- **Memory:** peak RSS sampled every 50 ms during the large-execution run.
- **Size:** bytes of each PDF. The Japanese font is subset on embed by both libraries (fontkit); the spike confirms this by comparing a Latin-only document with the same document plus one Japanese line.
- **Fidelity:** each chart in each PDF is compared by eye with the browser's rendering of the same SVG, and graded as matching, minor difference (named) or broken. Screenshots of any difference go in `out/`.
- **Fonts:** for each sample, does every glyph render? This covers body text, the table, the monospace Gherkin and the chart text, the cloud's Japanese tags included.

### 5. The monospace question
PDF libraries pick one font per run of text. Noto Sans Mono has no Japanese glyphs, so a Gherkin step written in Japanese, set in the mono face, would render blank. The spike tries three options:
- **(a)** Noto Sans JP for every script block, giving up monospace
- **(b)** splitting each line into Latin and CJK runs, each in its own font
- **(c)** Noto Sans Mono CJK JP, if its size is acceptable once subset

The finding feeds the font strategy in the ADR.

### 6. How the recommendation is reached
Each library has to pass two checks; failing either rules it out:
- every chart is graded "matching" or "minor difference"
- every glyph renders in every sample

Between libraries that pass, the tie-breakers are:
1. **Time** for 500 runs, against a budget of 30 s, which leaves room inside a job timeout. Lower wins only when the gap is over 25%.
2. **Maintenance:** adapter size, and whether the worker needs React and JSX.
3. **ADR 0006's default,** pdfmake, when the rest is even.

If neither passes, the write-up says so and presents headless Chromium (ADR 0006's alternative) as the option to decide, without building it here.

### 7. Recording the decision
After the user decides:
- **ADR 0026, "Report rendering library and fonts,"** amends ADR 0006 (and ADR 0023 if it adds SVG rules). It records:
  - the measurements as a table, with the hardware, Node version and library versions
  - the chosen library and why
  - the font files and the monospace strategy
  - the time and memory budget for the report job
  - rules for the SVG writers, such as the font family name
- ADR 0006 and ADR 0023 get "amended by ADR 0026" in their headers, and ADR 0006's Open Items mark the spike and the library choice as settled.
- `open-questions.md` moves D1 to the resolved table.
- The roadmap's Phase 10 Slice 1 entry records the outcome.

The harness is deleted in the same change, after the ADR quotes the commands that produced its numbers.

## Risks / Trade-offs

- **[Measurements from one machine]** → numbers are compared between libraries on the same machine, not as absolutes, and the ADR records the machine. The 30 s budget allows for slower hosting.
- **[A time-boxed spike can miss an SVG feature]** → the charts come from the real writers, which use the whole subset ADR 0023 allows. A new chart type later re-runs the fidelity check in its own slice.
- **[Font licences and size]** → Noto fonts are under the SIL Open Font License, which allows embedding. Both libraries subset fonts, which is checked (decision 4) rather than assumed.
- **[Deleting the harness loses reproducibility]** → the user's choice. The ADR keeps the method, the fixtures' shape and the exact commands, so the spike can be rebuilt if a revisit trigger fires.
- **[react-pdf's layout engine handles long tables differently]** → the large-execution sample has a 500-row table, so page breaks are part of the comparison.

## Migration Plan

None. Nothing ships. The harness is created and deleted inside the change, and only documentation remains.
