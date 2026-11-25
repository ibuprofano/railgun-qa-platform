# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, turn Phase 9 Slice 5 into a 🚧 entry pointing at the OpenSpec change `executions-dashboard`, with the scope and out-of-scope list from proposal.md. Verify that it reads correctly and that every link resolves.

## 2. Shared scope and figures in `packages/reporting`

- [x] 2.1 Add `src/execution-dashboard.ts` with `ExecutionFilters`, `filterExecutions` and `carriesAnyTag`, generic over the list fields (design.md decision 2). Re-export them from `apps/web/lib/execution-list-view.ts` and `apps/web/lib/tags-api.ts`, and delete the web copies. Verify that `execution-list.test.tsx` and the package build pass unchanged.
- [x] 2.2 Add the dashboard types and pure functions (design.md decision 2):
  - `scopeDashboard`
  - `executionTiles`, `executionDailySeries`, `executionStatusSplit` and `runOutcomeSplit`
  - `filterRuns`, `sortRuns` and `chartFilterLabel`
  - `ExecutionReportOptions` and `buildReportOptions`

  Add Vitest tests covering specs/execution-metrics' figure scenarios: tiles for a scope, no completed runs, Avg Duration "—", one day's runs, and narrowing the scope. Also cover the runs-table filter order, nulls sorting last both ways, the tie-break, and the label formats ("Pass", "4 Mar · Failed"). Verify `npm test -w packages/reporting` passes.
- [x] 2.3 Add `EXECUTION_DASHBOARD_EXECUTIONS_SQL` and `EXECUTION_DASHBOARD_RUNS_SQL` (design.md decision 3), exported from `src/index.ts`. Verify that the package builds, and that both run in the API e2e tests of group 3.

## 3. Dashboard read (API)

- [x] 3.1 Add `src/executions/execution-dashboard.ts`, which runs `parseTimeZone` and both queries in the caller's transaction and maps rows to the response of design.md decision 1. Add `@Get('dashboard')` (Viewer+) above `@Get(':executionId')` in `executions.controller.ts`. Verify that the API builds.
- [x] 3.2 Add `test/execution-dashboard.e2e-spec.ts` covering specs/execution-metrics:
  - a Viewer reads it
  - another workspace's member gets 403
  - `dashboard` isn't read as an id
  - an unknown `tz` is refused with 400
  - a trashed execution and its runs are absent
  - a run of a trashed test case is present under its recorded name
  - a restarted run appears once, Pending, with 2 attempts
  - a 23:30 UTC completion dates to the next day in `Europe/Madrid`
  - canceled and restarted executions have no completion day
  - the bug count excludes a trashed bug
  - the failed step comes only from a bug of the current attempt
  - a Pending run has no completion day and no last-updated time

  Add the scope test: for a tag filter, `filterExecutions` over the dashboard's execution rows picks the same ids as over `GET …/executions`. Verify `npm test -w apps/api` passes (with `SECRETS_MASTER_KEY` in the shell).

## 4. Charts

- [x] 4.1 Add `src/charts/stacked-bar.ts` and `stackedBarChartSvg` in `charts/svg.ts`, and add `sort: 'count'` to `donutChart` (design.md decision 8). Add package tests:
  - bar heights and stacking order
  - hidden series rescaling the axis
  - zero days drawn empty
  - a stable sort by count
  - the SVG using only `rect`, `line` and `text`

  Verify `npm test -w packages/reporting` passes.
- [x] 4.2 Add `components/charts/stacked-bar-chart.tsx`: its own range, legend toggles, hover and keyboard readout, summary, clickable segments and the readout's segment buttons. Give `LineChart` optional `range` and `onRangeChange`. Extend `charts.test.tsx` with specs/dashboard-charts' scenarios (one day's bar, hiding a series, reading a day, selecting a segment by keyboard), and check that an uncontrolled `LineChart` still keeps its own range. Verify the web tests pass, including the Overview and Test Cases chart tests unchanged.
- [x] 4.3 Give `DonutChart` `sortByCount`, `selectedKey` and `onSelect`, with legend buttons carrying `aria-pressed`. Add the execution status colours to `chart-format.ts`, and any missing `--chart-*` variables to `globals.css` for light and dark. Extend `charts.test.tsx` with selecting a part and selecting it again, and the Execution Status order (Done 4, In Progress 2, Draft 1). Verify the web tests pass.

## 5. Executions screen

- [x] 5.1 Move the list filters into `ExecutionsScreen` and make `ExecutionList` controlled for filters, keeping its sort local. Take the status options from the full status order, so Canceled is listed. Extend `execution-list.test.tsx` with "Filtering by Canceled", and verify the existing list scenarios still pass.
- [x] 5.2 Show the dashboard as the default right panel, and add the Dashboard toggle (`aria-pressed`) to the list's header. Add `?run=` handling: the screen passes `selectedRunId` and `onSelectRun` to `ExecutionDetail`, closing the panel drops `run`, changing execution drops `run`, and an unknown run leaves the panel closed. Update `executions-screen.test.tsx`, replacing the "Select an execution to see its runs." assertion. Extend `execution-detail.test.tsx`, and verify specs/executions-screen's default-panel and run-link scenarios.
- [x] 5.3 Add `getExecutionDashboard` and its `['projects', id, 'executions-dashboard', tz]` key to `lib/executions-api.ts`, with `staleTime: 0` and `refetchOnMount: 'always'` (design.md decision 5). Verify in `execution-dashboard.test.tsx` that it is called with the browser's zone, and refetched when the toggle returns to the dashboard.

## 6. Dashboard view

- [x] 6.1 Add `components/executions/execution-dashboard.tsx` with the scope notice (and Clear filters), the four tiles, the four charts, the loading placeholders (with History visible) and the "No executions yet" empty state (design.md decision 6). Add `execution-dashboard.test.tsx` and verify the scenarios in specs/executions-screen:
  - empty project
  - filtering by environment
  - clearing the filters
  - reading the tiles
  - status colours
  - each chart its own range
  - selecting Done in Execution Status, and selecting it again
- [x] 6.2 Add `execution-runs-table.tsx` (design.md decision 7): the tabs with the Needs Attention count, the layered filters, the chart-filter label with Clear filter, seven sortable columns with the failed step in red and Bugs red above 0, progressive rendering with the "N of M" counter and the "Show more" fallback, and rows that open the run in a new tab. Wire the bar segments and the Run Outcomes donut to it. Add `execution-runs-table.test.tsx`, stubbing `IntersectionObserver`, and verify the runs-table scenarios in specs/executions-screen:
  - the default tab
  - filtering by execution name
  - clearing a day filter
  - sorting by bugs
  - a failed step
  - scrolling to 120
  - opening a run
  - nothing to review
  - selecting a day's failures
  - selecting an outcome after a day, and selecting it again
- [x] 6.3 Add `export-dialog.tsx` (design.md decision 9): the button label rule, the two switches, the filters notice, and Download PDF, disabled with "PDF export is not available yet.". Add tests for the export scenarios in specs/executions-screen (the default label, all runs with no filters, the Runs switch following the tab, both switches off, before report generation). Also check that `buildReportOptions` receives the screen's filters, the runs-table state and both chart ranges. Verify the web tests pass.
- [x] 6.4 Give `DashboardHistory` a `tabs` prop (design.md decision 10), and use it on the Executions dashboard with the `executions` and `runs` feeds. Extend `dashboard-history.test.tsx` with the Runs tab ("5+" badge) and full history of the open tab. Verify that the existing single-tab Test Cases tests pass unchanged.

## 7. Integration check

- [x] 7.1 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w apps/api` (with `SECRETS_MASTER_KEY` in the shell), `npm test -w apps/worker`, `npm run test -w apps/web` and `npm test -w packages/reporting`, and verify that all pass. The known flaky worker test `trash-purge.spec.ts` › "runs as the trash_purge job" is recorded in the roadmap; report it if it fails. Also verify that `npm run build -w apps/api` succeeds.
- [x] 7.2 Manual run against the seeded database (`npm run dev`, signed in as the seeded user):
  1. Check that Executions opens on the dashboard.
  2. Check that the tiles agree with the list's counts.
  3. Filter the list by an environment, and check that the notice and every widget follow.
  4. Select Done in Execution Status, and check that the list follows.
  5. Select a Failed segment, and check that the table switches to All Runs with the day label.
  6. Open a row, and check that a new tab shows the execution with that run's panel.
  7. Open the export dialog, and check its switches and notice.
  8. Expand History, and switch between the Executions and Runs tabs.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 5 entry to ✅, with what was built, key decisions and anything deferred.
