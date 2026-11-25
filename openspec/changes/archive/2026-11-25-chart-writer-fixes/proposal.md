# Proposal

## Why

The D1 rendering spike ([ADR 0026](../../../docs/adr/0026-report-rendering-library-and-fonts.md), decision 5) found two defects in `packages/reporting`'s chart code. Neither has anything to do with the PDF library, and ADR 0026 asks for both to be fixed before the first report ships:

- **Word cloud widths.** `estimateWordWidth` assumes every character is 0.6 em wide. Japanese and other East Asian wide characters are about 1 em, so Japanese tags overlap their neighbours. The web's Bugs by Tag cloud uses the same geometry, so this is visible on the live Bugs dashboard today.
- **Date axis edge labels.** The line and stacked-bar charts centre the last x-axis label on the plot's right edge, where only 12 px of padding remain. Part of that label falls outside the chart: badly in print, where the label is a full ISO date ("2026-11-2…"), and slightly on screen. Print SVGs also show ISO dates where the screen shows "24 Nov".

## What Changes

- **Word widths by character class:** each East Asian wide or full-width character (CJK ideographs, kana, Hangul, full-width forms) counts 1 em, and every other character 0.6 em. The cloud's row layout and its shrink-to-fit both use this estimate, so wide words no longer overlap or overflow.
- **Edge-anchored date ticks:** the line and stacked-bar geometry give each x tick an anchor. The last tick is `end`-anchored at the plot's right edge, and the first is `start`-anchored when centring it would cross the left edge; the others stay centred. The web charts and the SVG writers both draw with the tick's anchor.
- **Short dates in print:** `lineChartSvg` and `stackedBarChartSvg` label ticks with a short day label ("24 Nov") by default, matching the screen. A formatter option lets a later report pass a locale.
- **Tests:** package tests for wide-character widths, a mixed Japanese and Latin cloud with no overlapping words in a row, tick anchors, and the print labels; a web chart test that the last tick is `end`-anchored.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dashboard-charts`: two added requirements: word-cloud words never overlap whatever their script, and axis date labels stay inside the chart and read as short days in every output.

## Impact

- **Packages:** `packages/reporting/src/charts/word-cloud.ts`, `line.ts`, `stacked-bar.ts` and `svg.ts`, with their tests. `xTicks` entries gain an `anchor` field. This is additive, so existing callers keep working.
- **Web:** `components/charts/line-chart.tsx` and `stacked-bar-chart.tsx` read `tick.anchor` instead of hard-coding `middle`; `charts.test.tsx` gains a test.
- **API, worker, database:** none.
- **Docs:** ADR 0026 decision 5 notes the fix and links this change; the roadmap's Phase 10 entry records it as done before the first report.
- **Out of scope:**
  - measuring real text widths (ADR 0023 keeps the package DOM-free)
  - localising month names in print, which a report slice can pass through the formatter
  - every other chart behaviour
