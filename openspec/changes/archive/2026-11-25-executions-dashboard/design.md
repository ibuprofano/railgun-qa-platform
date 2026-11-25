# Design

## Context

See proposal.md, Why. The current code constrains the approach:

- **The execution list filters in the browser.** `GET …/executions` returns every live execution with its run counts and `tagIds`. `ExecutionList` keeps `filters` and `sort` in its own state and applies `filterExecutions` and `sortExecutions` from `lib/execution-list-view.ts`. The tag match uses `carriesAnyTag` from `lib/tags-api.ts`. The status filter's `STATUSES` lacks `Canceled`, although `STATUS_ORDER` has it.
- **The dashboard must cover exactly what the list shows** (PRD §6.3.6), and Phase 10's PDF "reflects every active filter". That makes the list filter the scope, and the PDF worker needs the same definition.
- **Schema:**
  - `test_execution.completed_at` is set on entering Completed and kept through Done. Restart clears it, and Cancel never sets it.
  - `test_run.outcome_updated_at` is the current outcome's time.
  - `test_run_attempt` keeps one row per run per ended attempt.
  - `bug.test_run_id`, `bug.attempt` and `bug.failed_step_snapshot` link a bug to the run, the attempt and the step.
  - There is no run duration and no AI confidence column.
- **Run panel:** `ExecutionDetail` keeps `selectedRunId` in local state. No address opens a run.
- **Charts:** `LineChart` owns its range in state. `DonutChart` has no interaction, and `donutChart` keeps the given part order. There is no bar geometry in `packages/reporting`, though ADR 0023 lists bar rectangles.
- **Slice 4's precedent:**
  - the SQL shared with the PDF lives in `packages/reporting`
  - `parseTimeZone` checks `tz` against `pg_timezone_names`
  - the dashboard route is declared before the `:id` route
  - `StatTile`, `SectionCard` and `DashboardHistory` exist; `DashboardHistory` is fixed to the `test-cases` feed
- **The activity feed** already has `executions` and `runs` types.

## Goals / Non-Goals

**Goals:**
- **One definition of the scope:** the list, the dashboard and the Phase 10 PDF all apply the same filter function to the same fields.
- **Instant chart interaction:** clicking a part, a segment or a tab never waits on the network.
- **One read per dashboard view,** plus the History panel's feed page.

**Non-Goals:**
- Server-side paging of the runs table. The read returns every current run of the project's live executions (Risks).
- Live updates while the dashboard is open (PRD §6.12.4 doesn't require them).
- Rendering the PDF, or logging its download.

## Decisions

### 1. The API returns rows; the browser scopes and aggregates them
`GET /projects/:projectId/executions/dashboard?tz=` returns:

```ts
{
  today: string,                                   // YYYY-MM-DD in tz
  executions: {
    id, name, status, environmentName, browser, tagIds,
    completedOn: string | null,                    // YYYY-MM-DD in tz
  }[],
  runs: {
    id, executionId, executionName, position, testCaseId, testCaseName,
    outcome, completedOn: string | null, attempts, bugCount,
    failedStep: string | null, createdAt, outcomeUpdatedAt: string | null,
  }[],
}
```

The browser applies the list's filters to `executions` and keeps the runs of the executions left. It then computes every tile, series, split and table row from those.

**Why:** the scope is a filter that runs in the browser, and the charts re-filter the runs table on every click. With rows, every interaction is local, and there is one filter definition (decision 2).

**Alternatives:**
- **Filter parameters on the dashboard read:** this restates the name, status, environment, browser and tag rules in SQL beside the browser's copy, and every list filter change becomes a round trip.
- **Passing the in-scope execution ids:** the URL grows with the project, and runs-table clicks still need run rows.
- **Aggregates per execution per day:** this saves bytes, but the runs table needs run rows anyway.

**Dating happens in SQL:** `completedOn` and `today` are computed with `AT TIME ZONE $2`, as in Slices 3 and 4, so a day means the same on every dashboard. The browser builds 90 days ending at `today` with UTC date arithmetic on the strings, so its clock and zone never shift a day.

### 2. Scope, aggregation and SQL live in `packages/reporting/src/execution-dashboard.ts`
The module holds:
- **Filters:** `ExecutionFilters`, `filterExecutions` and `carriesAnyTag`, moved from the web and made generic over `{ name, status, environmentName, browser, tagIds }`. `lib/execution-list-view.ts` and `lib/tags-api.ts` re-export them, so the list's imports keep working.
- **SQL:** `EXECUTION_DASHBOARD_EXECUTIONS_SQL` and `EXECUTION_DASHBOARD_RUNS_SQL` (`$1` project id, `$2` time zone), run through `$queryRawUnsafe` as `TEST_CASE_FACTS_SQL` is.
- **Aggregation:**
  - `scopeDashboard(data, filters)`: the executions left after filtering, and their runs
  - `executionTiles(scope)`
  - `executionDailySeries(scope, today, days = 90)`: `completed[]` and `passed[]`, `failed[]` and `needsReview[]`
  - `executionStatusSplit(scope)` and `runOutcomeSplit(scope)`
- **The runs table:**
  - `RunTableState`: `{ tab, outcome, day, name, sort }`
  - `filterRuns`, applying the PRD order (tab, outcome, day and outcome, name)
  - `sortRuns`, with a stable tie-break on execution name, then position; nulls sort last in both directions
  - `chartFilterLabel`
- **`ExecutionReportOptions`:** `{ tz, filters, runTable, ranges: { executionsOverTime, runsOverTime }, include: { executions, runs } }`, the contract Phase 10's PDF job will consume.

Every function is pure, and Vitest covers it with the specs' scenarios. Pass Rate uses `pct` from `health.ts`. `avgDurationSeconds` is always `null` until runs record a duration.

**Why the package:** Phase 10's worker renders this PDF from `pg` (ADR 0006), and the PRD says the PDF uses "the same filtered set". Two copies of the filter or of the run-row SQL would drift.

### 3. The two queries
**Executions:** live executions of the project, with:
- `tag_ids`: the same subquery as the list's `EXECUTION_COLUMNS`, restated as text. An e2e test asserts that a tag filter scopes the dashboard to the same executions the list returns.
- `completed_on`: `(completed_at AT TIME ZONE $2)::date`, null when `completed_at` is null. A restarted execution therefore leaves Executions Over Time until it completes again, and a canceled one never enters it. This follows the PRD's "executions completed per day".

**Runs:** every `test_run` of a live execution, joined to `test_execution` and left-joined to `test_case`, with:
- `test_case_name`: `COALESCE(test_case_name_snapshot, tc.name)`, the run response's rule
- `completed_on`: from `outcome_updated_at`, only when the outcome isn't `Pending`
- `attempts`: `1 + count(test_run_attempt WHERE test_run_id = r.id)`. Runs can only be added in Draft, so every run has existed since attempt 1 or was added before its first start.
- `bug_count`: live bugs with `test_run_id = r.id`, from any attempt
- `failed_step`: the newest non-null `failed_step_snapshot` among live bugs with `test_run_id = r.id AND attempt = e.attempt`

Both queries filter `e.deleted_at IS NULL` and nothing on `test_case.deleted_at` (PRD §2.11: execution figures keep runs of trashed test cases, as in Slice 2). `bug_test_run_idx` and `test_run_attempt`'s `test_run_id` unique index serve the subqueries.

### 4. Route and response
`@Get('dashboard')` goes in `ExecutionsController`, declared above `@Get(':executionId')`, with `@RequireProjectRole('Viewer')`. One `withTenantContext` transaction runs `parseTimeZone`, then both queries, then maps rows to camelCase. A test checks that `dashboard` isn't read as an id.

### 5. Web state: the screen owns the list filters
- **`ExecutionsScreen`** holds `filters: ExecutionFilters` and passes `filters` and `onFiltersChange` to `ExecutionList`, which becomes controlled for filters (sort stays local, since it doesn't change the scope) and to `ExecutionDashboard`. Filters survive switching between the dashboard and a detail, since the screen stays mounted.
- **Right panel:** `selectedId ? <ExecutionDetail …/> : <ExecutionDashboard …/>`.
- **Dashboard toggle:** a button in the list's card header, `aria-pressed={selectedId === null}`. Pressing it calls `select(null)`, which also drops `run`.
- **Run in the address:** `ExecutionDetail` takes `selectedRunId` and `onSelectRun` from the screen, which reads and writes `?run=`. Selecting a different execution drops `run`. The panel opens only when the id is among the execution's runs.
- **Query:** key `['projects', id, 'executions-dashboard', tz]`, deliberately *not* under the list key. The live stream invalidates the list key on every change, and refetching the whole dashboard on each outcome is wasted work the PRD doesn't ask for. Freshness comes from `staleTime: 0` and `refetchOnMount: 'always'`: the dashboard unmounts while a detail is shown, so every return refetches it. `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`, as on the Overview.

### 6. Dashboard view composition
`components/executions/execution-dashboard.tsx` holds the dashboard state: runs tab (default `needsAttention`), outcome filter, day filter, name, sort (default Last Updated, newest first), and the two chart ranges. It derives everything else with `useMemo` over the package functions. It composes:
- **`ScopeNotice`:** above the tiles. It names each active list filter ("Status: Done", "Environment: Staging", "Browser: Firefox", "Tags: payments, auth", "Name: smoke"), with a Clear filters button that resets the screen's filters.
- **Four `StatTile`s.**
- **Executions Over Time:** a `LineChart` with one series.
- **Runs Over Time:** a `StackedBarChart`. A segment calls `toggleDay({ date, outcome })`, which also sets the tab to All Runs.
- **Execution Status:** a `DonutChart` with `sortByCount`, `selectedKey={filters.status}` and `onSelect`, which toggles the screen's status filter.
- **Run Outcomes:** a `DonutChart` whose `onSelect` toggles the outcome, clears the day and sets the tab to All Runs.
- **`ExecutionRunsTable`** and **`ExportDialog`**.
- **`DashboardHistory`** with two tabs.

**Run Outcomes switches to All Runs, an assumption beyond the PRD.** The PRD says only the bar segment switches tabs. On Needs Attention, every outcome except Needs Review would give an empty table, so the donut switches too. Selecting Needs Review there still works.

**Loading:** tile and chart skeletons, with the History panel rendered below them, since it has its own query. **Empty:** `executions.length === 0` shows the `EmptyState` with "No executions yet" and "Create an execution to start seeing metrics", and no export button. A scope that filters down to nothing still shows the widgets, each with its own empty line.

### 7. Runs table: progressive rendering in the browser
`execution-runs-table.tsx`:
- **Tabs:** `role="tablist"`, the Needs Attention tab with its count.
- **Name filter**, and the chart filter label with Clear filter.
- **Sortable headers:** `aria-sort`, and a button per header.
- **Rows:** each row is an `<a href="/executions?execution=<eid>&run=<rid>" target="_blank" rel="noopener">`, as the other dashboards link.
- **Paging:** it renders `visible = 50` rows. An `IntersectionObserver` on a sentinel after the last row adds 50 more, and a "Show more" button stands in where `IntersectionObserver` is missing. The counter reads `"{shown} of {total}"`. The table is keyed by a hash of the tab, filters and sort, so any change starts again at 50 and scrolls to the top.

**Why not server paging:** the rows are already in memory for the charts (decision 1). The PRD's "loads more as the user scrolls" is about not rendering thousands of rows at once, which this does.

### 8. Charts
- **`packages/reporting/src/charts/stacked-bar.ts`:**
  - `stackedBarChart({ dates, series, hidden, width, height })` returns `{ bars: { date, x, width, segments: { key, y, height, count }[] }[], yTicks, xTicks, plot }`
  - it reuses `linearScale`, `niceTicks` and `tickIndexes`
  - series stack in the given order and skip hidden ones
  - `stackedBarChartSvg` in `svg.ts` stays within ADR 0023's element subset: `rect`, `line` and `text`
- **`components/charts/stacked-bar-chart.tsx`** mirrors `LineChart`:
  - `RangeSelect`, legend toggles, pointer hover to the nearest bar, ←/→/Home/End on the focusable figure, and a summary like "Runs completed over the last 30 days: 40 passed, 6 failed, 4 needs review"
  - with `onSelect`, segments are clickable, and the readout lists the focused day's visible series as buttons with `aria-pressed`
  - the selected segment gets a ring, and the others dim
- **`LineChart` and `StackedBarChart`** take optional `range` and `onRangeChange` props. They are controlled when given, and keep their own state otherwise, so the Overview and Test Cases charts are unchanged.
- **`donutChart`** gains `sort?: 'count'`, a stable descending sort. **`DonutChart`** gains `sortByCount`, `selectedKey` and `onSelect`:
  - with `onSelect`, each legend entry is a `<button aria-pressed>`, and arcs are clickable
  - the selected arc is offset or ringed, and the others dim
- **Execution status colours** (PRD §6.3.6): Draft grey, Ready green, In Progress blue, Paused amber, Completed dark green, Done muted grey, Canceled muted red. They go in `chart-format.ts` as theme-variable references, adding `--chart-*` variables to `globals.css` where none exists, for light and dark.

### 9. Export dialog: options now, PDF later
`export-dialog.tsx`:
- **The button** reads "Download filtered report" when `filtersActive || tab === 'needsAttention' || outcome || day || name`, else "Download report". It is hidden in the empty state.
- **The switches:**
  - Test Executions: on, showing "{n} executions"
  - Runs: off, labelled "Needs Attention" or "Runs" by tab
- **The notice** lists the scope notice's entries and the runs-table filter.
- **Download PDF:** disabled while both switches are off, and always for now, with "PDF export is not available yet."
- **`buildReportOptions(state)`** builds an `ExecutionReportOptions`, and is unit-tested.

Phase 10 then only enables the button and posts the options, with "Generating…" and the error state the PRD describes.

**Alternative rejected:** hiding the button until Phase 10, as Slice 4 did. The roadmap puts the dialog's options in this slice, and building them now fixes the contract the PDF job reads.

### 10. Two-tab History panel
`DashboardHistory` takes `tabs: { type, label, title, emptyText }[]`:
- **With one tab** it renders exactly as today, so the Test Cases dashboard and its tests are unchanged.
- **With two** it shows a tab row (`role="tablist"`) inside the expanded panel. The badge counts the open tab, and "See full history" opens the dialog with `<ActivityFeed type={openTab.type} />`.
- **Each tab** reads `activityKeys.project(projectId, type)`, the Activity screen's cache. Only the open tab fetches.

### 11. The Canceled status filter
`execution-list.tsx` takes its statuses from `STATUS_ORDER`, so the filter lists all seven statuses and the Execution Status donut can set any of them.

## Risks / Trade-offs

- **[Payload grows with the project's run count]** → hundreds of executions and a few thousand runs is tens of kilobytes. If it grows past that, add server paging for the runs table, and keep the charts on aggregates. Only the read's shape changes; the package functions stay.
- **[The tag subquery is restated in the package SQL]** → the e2e scope test fails if the list's definition changes without it.
- **[Executions Over Time loses restarted executions' past completions]** → that follows the schema: `completed_at` is cleared on Restart, and the PRD counts executions completed, not attempts completed. Recorded here so nobody "fixes" it from the activity log silently.
- **[Filters live in screen state, not the address]** → a reload or a shared link loses them. Out of scope (proposal), and the PDF options carry them explicitly.
- **[The dashboard doesn't refresh while open]** → PRD §6.12.4 accepts this, and returning to the view always refetches.
- **[Assumption: Run Outcomes switches to All Runs]** → decision 6. One line changes if the PRD owner disagrees.

## Migration Plan

No migration. Deploy the API, then the web. The new route is additive, and the old web never calls it. Rollback is a redeploy of the previous builds.
