# Tasks

## 1. Word cloud widths

- [x] 1.1 In `packages/reporting/src/charts/word-cloud.ts`, add `charWidthEm` with the ranges of design.md decision 1. Rewrite `estimateWordWidth` to sum over code points, and make shrink-to-fit use the same estimate. Extend `word-cloud.test.ts`:
  - "決済" estimates twice the width of "ab" at the same size
  - a surrogate-pair ideograph counts once, at 1 em
  - a cloud of "決済", "search", "auth", "モバイル", "認証" and "integração" at 400 px has no two words in a row whose spans overlap, and every word lies inside the width
  - a Japanese tag wider than the cloud is shrunk to fit

  Verify `npm test -w packages/reporting` passes.

## 2. Date axis

- [x] 2.1 Add `anchor` to `xTicks` in `charts/line.ts` and `charts/stacked-bar.ts` (design.md decision 2). The last tick of several is `end` at `plot.right`; the first is `start` at `plot.left` only when its estimated half-width exceeds `plot.left`; the rest are `middle`; a lone tick is `middle`. Add package tests:
  - the anchors for a 30-day line chart and for stacked bars
  - a one-day chart
  - a narrow left padding forcing `start`, by calling with a long label

  Verify the package tests pass, and that the existing chart tests pass unchanged.
- [x] 2.2 In `charts/svg.ts`, add `shortDayLabel` and the `formatDate` option on `lineChartSvg` and `stackedBarChartSvg`, writing `text-anchor` from `tick.anchor` (design.md decision 3). Add tests: `"2026-11-24"` reads "24 Nov" with no time-zone shift, the written SVG holds `text-anchor="end"` for the last tick and no ISO date, and a custom formatter is used. Verify `npm test -w packages/reporting` and `npm run build -w packages/reporting` pass.
- [x] 2.3 In `apps/web/components/charts/line-chart.tsx` and `stacked-bar-chart.tsx`, draw x ticks with `textAnchor={tick.anchor}`. Extend `charts.test.tsx`: the last date label of a line chart and of a stacked bar chart has `text-anchor="end"`, and the others are `middle`. Verify `npm run test -w apps/web` passes.

## 3. Docs and integration

- [x] 3.1 In ADR 0026, note under decision 5 that both fixes landed in the OpenSpec change `chart-writer-fixes`. In the roadmap's Phase 10 "Remaining" line, drop the writer-fix item. Verify that the links resolve.
- [x] 3.2 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w packages/reporting`, `npm run test -w apps/web` and `npm run build -w apps/api`, and verify that all pass.
- [x] 3.3 Check the Bugs dashboard in the browser with a Japanese tag next to Latin tags, and the last date label on the Reported vs Resolved chart. Record the outcome in the roadmap's Phase 10 entry.

## Workflow follow-up

- Archive the change after review.
