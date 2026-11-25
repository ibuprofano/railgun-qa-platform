# Tasks

## 1. Docs

- [x] 1.1 Amend ADR 0023 decision 6: `packages/reporting` is compiled to JavaScript and imported by every app, because the API and worker production builds can't load TypeScript from outside `src` (overview-charts design.md decision 1). In `docs/roadmap-full.md`, turn Phase 9 Slice 3 into a 🚧 entry pointing at the OpenSpec change `overview-charts`, with the scope and out-of-scope list from proposal.md, and move stacked bars and the word cloud into Slices 5 and 6's scope. Verify that both read correctly and every link resolves.

## 2. Shared package

- [x] 2.1 Turn `packages/reporting` into a built package (design.md decision 1):
  - `src/index.ts`, `tsconfig.build.json` writing to `dist/`
  - `main` and `types` pointing at `dist`
  - `build`, `test` (Vitest), `typecheck` and `lint` scripts
  - a root `postinstall` that builds it
  - a `reporting` watcher in `scripts/dev.js`
  - `"@railgun-qa/reporting": "*"` in the API, worker and web

  Run `npm install`, then verify that `dist/index.js` and `dist/index.d.ts` exist and that `npm run lint`, `npm run typecheck` and `npm run build -w apps/api` all pass.
- [x] 2.2 Move `overview-metrics.ts` into `packages/reporting/src/health.ts`, with its tests as `health.test.ts`, and make the API import it from the package. Delete the API copy and its spec. Verify that the package's tests pass and that `test/overview.e2e-spec.ts` passes unchanged.
- [x] 2.3 Add `src/as-of-counts.ts` (design.md decision 3): the SQL string, the row type and `healthFromCounts`. Unit-test `healthFromCounts` on fixed rows: the healthy example 88, no completed run giving no score, and no recent runs giving a pass-rate component of 0. Switch the API's live Overview counts to the query with `NULL`. Verify that all 15 tests in `test/overview.e2e-spec.ts` pass unchanged.
- [x] 2.4 Add the chart geometry: `charts/scale.ts`, `line.ts`, `donut.ts` and `svg.ts` (design.md decision 2), with unit tests:
  - nice ticks for 0–100 and for counts (0–7 → 0, 2, 4, 6, 8)
  - one point per day, with days without data at 0
  - a null breaking the Health line
  - hidden series rescaling the axis
  - donut arcs summing to the full circle, percentages that round, and zero parts dropped
  - the serializer using no gradient, filter, mask or `foreignObject`, and only the allowed elements

## 3. Health Score snapshots

- [x] 3.1 Add migration `0017_health_snapshot` (up and down; design.md decision 4). Apply it to the dev database as `railgun_migrator` and run `npm run db:check-rls`. Verify that it passes, with the new table covered.
- [x] 3.2 Add `apps/worker/src/tasks/health-snapshot.ts`, registered in `tasks/index.ts` and in `crontab.ts` (`15 0 * * * health_snapshot ?fill=1d`). Add `health-snapshot.spec.ts` and verify:
  - a live project gets one row for the previous UTC day, with the same score the API reports
  - a trashed project gets none
  - a project with no runs is recorded with a null score
  - a second run changes nothing
  - a late run labels the day by `_cron.ts`
  - one project failing still records the others, and the task throws

  Extend `crontab.spec.ts` for the new entry, and `trash-purge.spec.ts` so that purging a project removes its snapshots and leaves other projects' alone. Verify with `npm test -w apps/worker`.

## 4. API: trends

- [x] 4.1 Add `GET /projects/:projectId/overview/trends?tz=` (design.md decision 5) with its response type. Add `test/overview-trends.e2e-spec.ts` and verify every project-metrics scenario:
  - 90 points in each series, ending today
  - a 23:30 UTC run counted on the next day for `Europe/Madrid`
  - reported and resolved bugs counted on their own days
  - `Mars/Olympus` → 400
  - a snapshot day returned as recorded, even after the data changed
  - a gap day recomputed with a then-open Critical bug in its bug pressure
  - today's point equal to the Overview's live score
  - no score before the first completed run
  - the 30-day split of 30, 6 and 4
  - trashed items excluded
  - no access → 403

## 5. Web: charts and Overview

- [x] 5.1 Add `components/charts/` (`line-chart.tsx`, `donut-chart.tsx`, `range-select.tsx`; design.md decision 6) with tests, and verify every dashboard-charts scenario:
  - the range defaults to 30 and changes only its own chart
  - ←/→ move the active day, and the tooltip shows the date and values
  - a legend toggle hides a series and marks it pressed
  - a donut shows its centre total, legend percentages, hidden zero parts and empty line
  - each chart has its accessible name and summary
- [x] 5.2 Add `getOverviewTrends` and `overviewKeys.trends` to `lib/overview-api.ts`, and lay out the four charts on the Overview (PRD §6.1 rows 2–4). Extend `overview-screen.test.tsx` to verify every new overview-screen scenario:
  - the row layout
  - the Health trend's last point equal to the tile
  - "No data yet." with no score
  - 80% on a day with 8 of 10 passing, and the 0-days tooltip text
  - Bug Velocity's two series for one day
  - the donut's "No completed runs yet."
  - the request carries the browser's time zone

  Verify the existing Overview tests still pass.

## 6. Integration check

- [x] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test -w apps/api` (with `SECRETS_MASTER_KEY` in the shell), `npm test -w apps/worker`, `npm run test -w apps/web` and `npm test -w packages/reporting` from the repository root, and verify that all pass. Also verify that `npm run build -w apps/api` and `npm run build -w apps/worker` succeed with the package import.
- [x] 6.2 Manual run against the seeded database (`npm run dev`, signed in as the test user):
  1. Check that the Overview shows the four charts.
  2. Check that the Health trend ends at the tile's score.
  3. Check that changing one chart's range leaves the others alone.
  4. Check that hovering shows the day's values, and the Bug Velocity legend hides a series.
  5. Check that the charts follow dark mode.
  6. Run the snapshot task once (`npx graphile-worker --once`, or by enqueuing it) and check that a row appears for yesterday.

  Record the result in the roadmap entry.

## Workflow follow-up

- Update the roadmap-full.md slice entry to ✅ with Built / Key decisions / Deferred.
- Archive with `/opsx:archive` once review is done.
