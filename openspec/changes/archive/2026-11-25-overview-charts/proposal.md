# Proposal

## Why

Phase 9 Slice 3 ([roadmap-full.md](../../../docs/roadmap-full.md)) adds the Overview's four charts (PRD §6.1): Health Score trend, Pass Rate trend, Bug Velocity and the Run Outcomes donut. It also builds the chart building blocks that the per-screen dashboards (Slices 4–6) will reuse.

Both open decisions are settled:
- [ADR 0023](../../../docs/adr/0023-chart-rendering.md): one in-house chart module in `packages/reporting`, shared by the screen and the reports.
- [ADR 0024](../../../docs/adr/0024-health-score-history.md): a daily snapshot job, with recomputed gap days, on UTC days.

Both put shared code in `packages/reporting`, making it the first workspace package an app imports.

## What Changes

- **`packages/reporting` becomes a real package.**
  - It is compiled to JavaScript, and every app imports the build. The API's and worker's production builds can't load raw TypeScript from outside their `src`.
  - It holds the Health Score formulas (moved from `apps/api/src/overview/overview-metrics.ts`), the shared as-of counting query, and the chart geometry: line and donut charts.
  - It has its own unit tests.
  - It is built on install and watched by `npm run dev`.
- **One counting query for every Health Score:** the Overview's live score (Slice 2), each daily snapshot and each recomputed day all use the same as-of query, so one definition can't drift into three.
- **Health Score snapshots:**
  - Migration `0017_health_snapshot` adds a tenant table, one row per project per UTC day, with the score, band and components. A project purge removes its rows.
  - The worker gets read access to `test_run` and can insert snapshots. The API can read them.
  - A new `health_snapshot` crontab task runs at 00:15 UTC and records every live project for the UTC day that just ended. It never overwrites a day, and one project's failure doesn't stop the others.
- **Overview trends** (`GET /projects/:projectId/overview/trends?tz=<IANA zone>`, Viewer+): 90 days of daily data in one read:
  - the pass rate's completed and passed counts, and bugs reported and resolved, both per day in the viewer's time zone
  - the Health Score for each UTC day: from a snapshot, recomputed, or live for today
  - the last 30 days' Pass, Fail and Needs Review split
- **Web:**
  - a `LineChart` and a `DonutChart` built on the shared geometry. They have a 7/15/30/90-day range selector (default 30), hover and focus values for the nearest day, legend toggles for multi-series charts, an accessible name and summary, and colours from the theme.
  - the Overview gains the four charts in the PRD §6.1 layout, each with its own range.
- **Docs:**
  - ADR 0023 decision 6 now says the package is compiled and imported by every app.
  - The roadmap's Slice 3 entry. Stacked bars and the word cloud move to Slices 5 and 6, which are the first to use them.

## Capabilities

### New Capabilities

- `health-snapshots`: the daily snapshot job — what it records, when, idempotency, isolation and the projects it skips.
- `dashboard-charts`: the web chart building blocks' behaviour: ranges, hover, legends, empty days, accessibility.

### Modified Capabilities

- `project-metrics`: the trends read (daily series, Health Score history, the outcome split) and its time-zone handling.
- `overview-screen`: the four charts and their layout.
- `trash-purge`: purging a project also removes its Health Score snapshots.

## Impact

- **DB:** migration `0017_health_snapshot`: the table, forced RLS, grants, and `SELECT` on `test_run` for `railgun_worker`.
- **Packages:** `packages/reporting` gains `src/`, a build to `dist/`, and tests. The root `package.json` builds it on install, and `scripts/dev.js` watches it.
- **API:**
  - `src/overview/` imports the formulas and the as-of query from the package
  - a new trends route in `overview.controller.ts`
  - `overview-metrics.ts` is removed, with its tests moved into the package
- **Worker:** `src/tasks/health-snapshot.ts`, registered in the task list and the crontab.
- **Web:**
  - `components/charts/` (line, donut, range selector)
  - `lib/overview-api.ts` gains the trends read
  - `components/overview/overview-screen.tsx` gains the charts
- **Out of scope:**
  - stacked bars and the word cloud (Slices 5–6)
  - the dashboard PDFs (Phase 10)
  - live updates for the charts
  - replaying past test case statuses for recomputed days (ADR 0024 revisit trigger)
