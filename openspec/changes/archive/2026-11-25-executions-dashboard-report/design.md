# Design

## Context

See proposal.md, Why. The relevant code:

- **The pipeline (`report-pipeline`) is Bugs-only:**
  - The API's `report-rules.ts` maps `bugs-dashboard` to `bugs_dashboard` and validates `{ kind, tz, range }`.
  - `REPORT_LABELS` gives the activity name, and the controller logs every download under category `Bugs`.
  - The worker's `generateReport` claims the report, then always runs the Bugs queries, `bugReportData`, `bugsDashboardDocument` and the `bugs-dashboard-<day>.pdf` name.
  - `report.kind` is checked against `('bugs_dashboard')`.
  - The web's `useReportDownload(projectId, kind)` takes `{ tz, range }`.
- **The Executions dashboard (Phase 9 Slice 5):**
  - `packages/reporting/src/execution-dashboard.ts` has the row SQL: `EXECUTION_DASHBOARD_EXECUTIONS_SQL` and `EXECUTION_DASHBOARD_RUNS_SQL` (`$1` project, `$2` zone), and `EXECUTION_DASHBOARD_TODAY_SQL` (`$1` zone).
  - The same file has `executionDashboardFromRows`, `scopeDashboard`, `executionTiles`, `executionDailySeries`, the two splits, `filterRuns`, `sortRuns`, `describeFilters`, `chartFilterLabel`, `isDashboardFiltered`, and `ExecutionReportOptions` with `buildReportOptions`.
  - The runs query reads `test_run_attempt`, and the executions query reads `test_case_tag`. The worker can read neither yet.
- **Export dialog:** `export-dialog.tsx` builds the options and accepts `onDownload`. While `onDownload` is absent it shows "PDF export is not available yet." and keeps Download PDF disabled. `ExecutionDashboard` doesn't pass it.

## Goals / Non-Goals

**Goals:**
- Adding a report means adding a registry entry on each side (API rules, worker builder), not editing the pipeline.
- The PDF scopes, filters and sorts with the dashboard's own functions, fed the options the dialog already builds.

**Non-Goals:**
- A shared registry package spanning the API and the worker. The two sides need different things: validation and labels, against queries and layout. Only the kind names are shared, through `packages/reporting`.
- Changing what the Bugs report does.

## Decisions

### 1. Kind names in `packages/reporting`
`src/report-kinds.ts` exports:
- `REPORT_KINDS = { 'bugs-dashboard': 'bugs_dashboard', 'executions-dashboard': 'executions_dashboard' }`
- the `ReportApiKind` and `ReportDbKind` types
- `REPORT_KIND_LABELS`: `{ name, fileBase, category }` per stored kind:
  - `bugs_dashboard`: "Bugs dashboard report", `bugs-dashboard`, `Bugs`
  - `executions_dashboard`: "Executions dashboard report", `executions-dashboard`, `Executions`

The API, the worker and the web all read these, so a kind's name and file name are written once.

### 2. API: a validator per kind
`report-rules.ts` keeps `parseReportRequest(tx, body)`. After checking `kind`, it calls that kind's parser:
- **`bugs-dashboard`:** `{ tz, range }`, as today.
- **`executions-dashboard`:** builds an `ExecutionReportOptions`:
  - `tz`, through `parseTimeZone`
  - `filters`: `name?` a string of at most 200 characters; `status?` in `EXECUTION_STATUSES`; `environmentName?` a string; `browser?` Chromium, Firefox or WebKit; `tagIds?` an array of at most 50 uuids
  - `runTable`:
    - `tab` is `needsAttention` or `all`; `outcome` is in `RUN_OUTCOMES` or null; `name` is a string of at most 200 characters
    - `day` is null or `{ date: YYYY-MM-DD, outcome }`, with the outcome in the completed outcomes
    - `sort` has a key that is a `RunSortKey` and a direction of `asc` or `desc`
  - `ranges.executionsOverTime` and `ranges.runsOverTime`, each in {7, 15, 30, 90}
  - `include.executions` and `include.runs` as booleans, at least one of them true

  Anything else answers 400. The result goes through `buildReportOptions`, so what's stored is the cleaned contract.

The body stays flat (`{ kind, …options }`). The download route takes the activity name and category from `REPORT_KIND_LABELS`. Per-kind tests sit in `report-rules.spec.ts`, which tests the parsers directly, plus e2e scenarios.

### 3. Migration `0020_report_kinds`
- `ALTER TABLE report DROP CONSTRAINT report_kind_check, ADD CONSTRAINT report_kind_check CHECK (kind IN ('bugs_dashboard', 'executions_dashboard'))`
- `GRANT SELECT ON test_run_attempt, test_case_tag TO railgun_worker`

The down migration reverses both, and fails if an executions report exists, which is the right refusal.

### 4. Worker: a builder per kind
`src/reports/kinds.ts`:

```ts
type Builder = (client: PoolClient, report: { projectId; options }) => Promise<{ definition: unknown; fileDay: string }>;
export const BUILDERS: Record<ReportDbKind, Builder> = { bugs_dashboard, executions_dashboard };
```

- `generateReport` keeps its claim, retry, store and event logic. Its step 2 becomes `BUILDERS[claimed.kind](client, claimed)`. The file name is `${REPORT_KIND_LABELS[kind].fileBase}-${fileDay}.pdf`.
- **The Bugs builder** is today's code, moved.
- **The executions builder** runs:
  1. `EXECUTION_DASHBOARD_TODAY_SQL`, then the executions and runs queries in `options.tz`
  2. `SELECT id, name FROM tag WHERE id = ANY($1)` for the tag names in the filters
  3. `project.name`
  4. `executionReportData`, then `executionsDashboardDocument`

  An unknown kind (a stored row from a later version) fails the attempt.

### 5. `packages/reporting/src/execution-report.ts`
`executionReportData(data, options, { projectName, tagName })`:
- `scope = scopeDashboard(data, options.filters)`
- **`tiles`:** `executionTiles(scope)`
- **`charts`:** `executionDailySeries(scope, data.today)`, sliced to each range:
  - **Executions Over Time:** a `lineChart` and `lineChartSvg` over `options.ranges.executionsOverTime` days
  - **Runs Over Time:** a `stackedBarChart` and `stackedBarChartSvg` over `options.ranges.runsOverTime` days, with Passed, Failed and Needs Review
- **`donuts`:** Execution Status (sorted by count) and Run Outcomes, with `PRINT_EXECUTION_STATUS_COLORS` and `PRINT_OUTCOME_COLORS`, hex mirrors of the theme's `--status-*` and outcome variables
- **`filters`:** `describeFilters(options.filters, tagName)`
- **`executions`:** when `include.executions`, rows of `{ name, status label, environment, browser, completedOn }`
- **`runs`:** when `include.runs`, `sortRuns(filterRuns(scope.runs, options.runTable), options.runTable.sort)` as `{ execution, position, testCase, outcome, attempts, bugs }`, with the runs filter named (tab, `chartFilterLabel` with `shortDayLabel`, and name)

Vitest checks it against the dashboard functions.

**A shared `ReportDonut` type:** `bug-report.ts`'s `donut()` helper and `ReportDonut` move to `report-parts.ts` and are reused.

### 6. The executions document
`executionsDashboardDocument(report)` follows the Bugs document's style:
- the title and date, then "Filters: …" (or "No filters")
- the four tiles
- both charts, then the two donuts side by side
- "Executions (n)" with a `headerRows: 1` table, when present
- "Runs (n) — <filter>" with a `headerRows: 1` table, when present
- `pageNumbers: true`

### 7. Web
- **`lib/reports-api.ts`:** options become a map, `ReportOptionsByKind = { 'bugs-dashboard': { tz, range }; 'executions-dashboard': ExecutionReportOptions }`. `useReportDownload<K>(projectId, kind: K)` returns `start(options: ReportOptionsByKind[K])`, and `requestReport` spreads the options as today.
- **`ExecutionDashboard`** calls `useReportDownload(projectId, 'executions-dashboard')` and passes `onDownload={download.start}` and `downloadState={download.state}` to `ExportDialog`.
- **`ExportDialog`:**
  - Download PDF reads "Generating…" and is disabled while generating, and is disabled while both switches are off
  - on failure the dialog shows "The report couldn't be generated." with Try again, which calls `onDownload(options)` again
  - `PDF_UNAVAILABLE_TEXT` goes
  - the dialog stays open until the file downloads, then closes

## Risks / Trade-offs

- **[A project with thousands of runs, with Runs on]** → the runs table grows in pages. At ADR 0026's measured rate, 500 rows render in about 1 s, so a few thousand fit well inside the 30 s budget. Recorded here, and covered by the job timeout.
- **[Options outlive a rename]** → a tag renamed between the request and the render shows its new name. Tags are read at render time, which is "the moment it is generated" in the spec.
- **[Kind lists in three places]** → the kind names live in one package. Each side's registry is typed `Record<ReportDbKind, …>`, so adding a kind without a parser or a builder fails the typecheck.

## Migration Plan

1. Apply 0020 as `railgun_migrator`.
2. Deploy the worker, then the API, then the web.

**Rollback:** redeploy the previous builds, delete any `executions_dashboard` reports, then run 0020's down migration.
