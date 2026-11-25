# Design

## Context

See proposal.md, Why. The relevant code:

- **The dashboard is built in the API:**
  - `apps/api/src/test-cases/test-case-dashboard.ts` runs six Prisma tagged-template queries (cases with their last outcome, run stats, top tags, the folder tree, the 90 daily rows, any completed run) plus the shared `TEST_CASE_FACTS_SQL`.
  - It then builds the tiles, the splits, Needs Attention, the rankings and Folder Health in TypeScript, and imports `TREND_DAYS` (90) from `overview/overview-trends.ts`.
  - The worker uses `pg`, not Prisma, and can't import from the API.
- **The precedent:**
  - `packages/reporting/src/bug-dashboard.ts` holds positional SQL constants (`$1` project, `$2` zone) and a pure `bugDashboardFromRows`.
  - `apps/api/src/bugs/bug-dashboard.ts` runs them through `$queryRawUnsafe`.
  - The worker's Bugs builder runs the same constants through `client.query`.
- **The web dashboard:**
  - `test-case-dashboard.tsx` has no header button.
  - Its two `LineChart`s keep their own range (default 30); `LineChart` already accepts `range` and `onRangeChange`, which the Bugs dashboard uses.
  - `needs-attention-table.tsx` keeps its filter, sort (`name | issue | status | createdAt | updatedAt`, default Created ascending) and paging locally, with the comparator in the component.
  - `ISSUE_LABELS` live in `dashboard-format.ts`, and `unrankedFailingText` in `dashboard/section-card.tsx`.
- **Grants:** the worker already has SELECT on `test_case`, `test_run`, `test_execution`, `test_run_attempt`, `test_case_tag`, `tag` and `folder` (migrations 0014, 0017, 0019, 0020).

## Goals / Non-Goals

**Goals:**
- The screen and the PDF read the same queries and the same pure figures, so they can't disagree (PRD §8).
- The PDF's Needs Attention follows the filter and sort on screen, through one shared filter and sort function.
- Adding the kind follows Slice 3's registry: one entry per side, enforced by the `Record<ReportDbKind, …>` types.

**Non-Goals:**
- Changing any dashboard figure or the response shape. The API's JSON stays byte-for-byte the same, and the existing dashboard e2e tests prove it.
- Moving the Overview's metrics into the package. That is the Overview PDF's slice.
- An export dialog. This dashboard has nothing to switch on or off, so it gets a header button like the Bugs dashboard.
- The dashboard's recent history in the PDF (PRD §8 doesn't list it for this report).

## Decisions

### 1. Move the dashboard into `packages/reporting/src/test-case-dashboard.ts`
The file contains:

- **Queries:** `TEST_CASE_DASHBOARD_CASES_SQL`, `_STATS_SQL`, `_TAGS_SQL`, `_FOLDERS_SQL` (`$1` project) and `_DAYS_SQL` (`$1` project, `$2` zone), plus `_ANY_COMPLETED_SQL` (`$1` project). They are today's queries rewritten with positional parameters:
  - `RANKING_LIMIT` (10) and `DASHBOARD_DAYS` (90, the constant the Executions dashboard already exports and equal to `TREND_DAYS`) are interpolated into the strings once, at module load, as `bug-dashboard.ts` does
  - the days query returns `date` as `YYYY-MM-DD` text, as today
- **Row types:** one per query, matching what both Prisma and `pg` return for these casts (`::int`, `timestamptz` → `Date`, `uuid[]` → `string[]`).
- **`testCaseDashboardFromRows({ facts, cases, stats, tags, folders, days, anyCompleted })`:** today's assembly code moved unchanged. It returns `TestCaseDashboard`, whose types move too (`DashboardDay`, `TestCaseNeedsAttentionRow`, `RankedTestCase`, `FolderHealthRow`). The row type is renamed because `bug-dashboard.ts` already exports a `NeedsAttentionRow`.
- **Needs Attention:**
  - `NeedsAttentionSortKey = 'name' | 'issue' | 'status' | 'createdAt' | 'updatedAt'`, with `NeedsAttentionState = { name: string; sort: { key; direction: 'asc' | 'desc' } }` and `DEFAULT_NEEDS_ATTENTION = { name: '', sort: { key: 'createdAt', direction: 'asc' } }`
  - `filterNeedsAttention(rows, name)` and `sortNeedsAttention(rows, sort)`, the component's current logic: case-insensitive substring match on the trimmed name, then the column comparator, then created time, then id, the whole order reversed for `desc`
- **Display text:**
  - `ISSUE_LABELS`, moved from `dashboard-format.ts`, which re-exports it
  - `unrankedFailingText`, moved from `section-card.tsx`, which re-exports it
  - `REPORT_FAILED` moves from the Bugs dashboard into `lib/reports-api.ts` (web), so the Test Cases dashboard doesn't import a Bugs component

`apps/api/src/test-cases/test-case-dashboard.ts` keeps `loadTestCaseDashboard(tx, projectId, tz)` and its export of the types. It runs the seven queries with `$queryRawUnsafe` and returns `testCaseDashboardFromRows(...)`.

**Why move rather than reimplement in the worker:** two copies of the figures is exactly the drift PRD §8 forbids. The Bugs dashboard already set the shape.

**Alternative considered:** having the worker call the API's HTTP endpoint. Rejected: the worker would need a user token, and the job would depend on the API being up.

### 2. Kind, options and validation
- **`report-kinds.ts`:** `'test-cases-dashboard': 'test_cases_dashboard'`, labelled `{ name: 'Test Cases dashboard report', fileBase: 'test-cases-dashboard', category: 'Test Cases' }`.
- **`TestCaseReportOptions`** (in `test-case-report.ts`):

  ```ts
  { tz: string;
    ranges: { overTime: 7 | 15 | 30 | 90; passRate: 7 | 15 | 30 | 90 };
    needsAttention: NeedsAttentionState }
  ```

- **`report-rules.ts`** gains `parseTestCaseReportOptions(body, tz)`:
  - both ranges through the existing `range()`
  - `needsAttention` must be an object
  - `name` through `optionalText` (at most 200), stored as `''` when absent
  - `sort.key` through `oneOf` against the sort keys
  - `sort.direction` through `oneOf` against `asc` and `desc`

  It goes into `PARSERS` as `test_cases_dashboard`. A missing `needsAttention` is refused rather than defaulted, as the Executions parser does with `runTable`, so a client bug shows up as a 400.

### 3. Migration `0021_test_cases_report_kind`
- **Up:** drop `report_kind_check` and re-add it with `('bugs_dashboard', 'executions_dashboard', 'test_cases_dashboard')`.
- **Down:** restores the two-kind check, and fails while a `test_cases_dashboard` row exists, which is the right refusal (as 0020).

No grants are needed: see Context.

### 4. `packages/reporting/src/test-case-report.ts`
`testCaseReportData(dashboard, options, { projectName, tagName })` returns:

- **`tiles`:** the dashboard's four tiles with their sub-labels, formatted as the screen formats them. Ready and Coverage use `pct`, and Avg Confidence is `'—'` while null.
- **`charts`:**
  - **Test Cases Over Time:** a `lineChart` and `lineChartSvg`, count, over the last `ranges.overTime` days. It has Created, Added to executions and Completed series.
  - **Pass Rate Trend:** percent, `pct(passed, completed)` per day as on screen, over the last `ranges.passRate` days. Only present when `hasCompletedRuns`.
- **`donuts`:** Last Run Outcome (Pass, Fail, Needs Review, Never Run) and Source Type (Gherkin, Manual), through the shared `donut()` helper. The colours:
  - `PRINT_OUTCOME_COLORS` for the three outcomes, plus a grey for Never Run
  - new `PRINT_SOURCE_TYPE_COLORS` (violet and blue hex mirrors of `--tag-violet` and `--tag-blue`)
- **`needsAttention`:**
  - `{ total, filter, rows }`, where `total` is every flagged case, `filter` is `Name: pay` or null, and `rows` is `sortNeedsAttention(filterNeedsAttention(…))`
  - each row is `{ name, tags: tagName(id)[], issues: ISSUE_LABELS[], status, created, updated }`
  - the two days are `YYYY-MM-DD` in the requester's zone, printed as "24 Nov 2026"
- **`rankings`:** the four lists as `{ rank, name, value }` text, with Top Failing's value as `75% (3/4)`. Each ranking has its empty line as on screen, plus `unrankedFailingText` when `failingBelowMinimum > 0`.
- **`folderHealth`:** rows of `{ path: 'A / B', cases, issues: 'n (p%)' or '—', breakdown: 'No Script 2 · Dormant 1' }`.

**Days in the zone:** `NeedsAttentionRow.createdAt`/`updatedAt` are ISO instants. The builder passes the zone, and the function formats with `Intl.DateTimeFormat('en-GB', { timeZone })`, which Node supports for every zone Postgres accepted.

### 5. Worker builder and document
In `kinds.ts`, `testCasesDashboard`:
1. Runs the seven dashboard queries in `opts.tz` (`loadTestCaseDashboardRows`, exported so the worker test can compare against the same figures read as `railgun_app`).
2. Takes the file's day from the dashboard's last day, which is today in the zone, rather than a separate query.
3. Reads the names of the tags on the Needs Attention rows: `SELECT id, name FROM tag WHERE id = ANY($1)`, with a fallback of "Deleted tag".
4. Reads the project name.
5. Calls `testCaseReportData`, then `testCasesDashboardDocument`.

It goes into `BUILDERS` as `test_cases_dashboard`.

`testCasesDashboardDocument(report)` follows the Bugs and Executions documents:
1. the title and date
2. the four tiles
3. the chart(s)
4. the two donuts side by side
5. "Needs Attention (shown of total)", with "Filter: …" when set, and a `headerRows: 1` table
6. the rankings two per row, as small tables
7. "Folder Health" as a `headerRows: 1` table
8. `pageNumbers: true`

Empty sections print their empty line rather than an empty table.

### 6. Web
- **`lib/reports-api.ts`:** `ReportOptionsByKind['test-cases-dashboard'] = TestCaseReportOptions`.
- **`TestCaseDashboard`:**
  - holds `overTimeRange` and `passRateRange` (default `DEFAULT_RANGE`), passed to each `LineChart` as `range`/`onRangeChange`
  - holds `needsAttention: NeedsAttentionState` (default `DEFAULT_NEEDS_ATTENTION`)
  - the heading row becomes "Dashboard" with **Download report** on the right, plus the Generating, failure and Try again states, copied from `BugDashboard`'s header
  - `start({ tz: timeZone, ranges, needsAttention })`
- **`NeedsAttentionTable`** becomes controlled (`state`, `onStateChange`). It filters and sorts with the package functions, and keeps its paging locally. Its column toggle maps to `direction`: the same column flips it, and a new column starts `asc`.
- `test-cases-api.ts`'s `TestCaseDashboard` type becomes a re-export of the package's, replacing the hand-written mirror.

## Risks / Trade-offs

- **[A refactor under a feature]** → the move could change a figure. Mitigation: it is task 2.1 on its own, and `test/test-case-dashboard.e2e-spec.ts` and the web dashboard tests must pass unchanged before any report code is written.
- **[`pg` and Prisma return different shapes]** → a `bigint` or `numeric` sneaking through would arrive as a string from `pg`. Every count is already cast `::int`. The worker test asserts the figures of a seeded project, which would catch a mismatch.
- **[Large Needs Attention lists]** → every matching row is printed, unlike the screen's 10. A few thousand rows sit well inside the 30 s budget at ADR 0026's measured rate, and the job timeout covers the rest.
- **[Tag renamed between request and render]** → the report shows the new name, as the Executions report does ("the moment it is generated").

## Migration Plan

1. Apply 0021 as `railgun_migrator`.
2. Deploy the worker, then the API, then the web.

**Rollback:** redeploy the previous builds, delete any `test_cases_dashboard` reports, then run 0021's down migration. The package move has no data impact.
