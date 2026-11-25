# Design

## Context

See proposal.md, Why, and [ADR 0025](../../../docs/adr/0025-test-case-health-and-edit-times.md). The current code constrains the approach:

- **`test_case`** has `created_at`, but no change times. Its writers are all in `apps/api/src/test-cases/test-cases.controller.ts`:
  - create, an `INSERT`
  - update, which locks the row, builds a `changes` diff (`name`, `gherkinScript: true`, `status`, `tags`) and logs `test_case.updated` only when it isn't empty
  - move, which always logs `test_case.moved`
  - delete

  Trash restore (`trash/trash-queries.ts`) and folder delete also update the table, but only its deletion columns. The demo seed inserts rows directly.
- **Reads** share one `TEST_CASE_SELECT`, and every write returns `loadTestCase(...)`. The tree's `lastOutcome` comes from a lateral join over current outcomes in live executions.
- **Runs:**
  - `test_run` has `created_at` (when it was added; Restart keeps the row) and `outcome_updated_at` (the current outcome's time).
  - `test_run_attempt` keeps earlier attempts' outcomes per `test_run_id`, which is what makes a run flaky (PRD §6.12.1).
  - There is no AI confidence column.
- **`packages/reporting`** (Slice 3) is compiled to `dist/` and imported by the API, worker and web. It already shares a SQL string with its formulas (`AS_OF_COUNTS_SQL` with `figuresFromCounts`), which runs through Prisma's `$queryRawUnsafe` and through `pg`.
- **The Overview** (`apps/api/src/overview/`) has `parseTimeZone` (checked against `pg_timezone_names`), 90-day series in a `generate_series` CTE, and Top Failing ordered by the exact ratio.
- **Web:**
  - The Test Cases right panel shows the folder summary, the detail, or the placeholder "Select a test case to see its details." (asserted in `screen-states.test.tsx`).
  - The Overview's `KpiTile` and `Panel` are local to `overview-screen.tsx`.
  - `LineChart` and `DonutChart` are in `components/charts/`.
  - `ActivityFeed` and `ActivityRow` are exported from `components/activity/activity-screen.tsx`, and the feed's `test-cases` type covers `entity_type = 'test_case'`.

## Goals / Non-Goals

**Goals:**
- **One definition of each health rule**, used by the banners, Needs Attention and Folder Health, and by Phase 10's worker-rendered PDF later.
- **Figures that agree with the Overview** where the PRD says they are the same: total, Ready share, coverage, and the daily pass rate.
- **One read per screen state:** one dashboard request, plus the History panel's feed page.

**Non-Goals:**
- Speeding up the dashboard query for very large projects. It reads every live test case's facts once; indexes can come later (Risks).
- Shared dashboard layout primitives beyond the tile and the card. Slices 5 and 6 may extract more when they need them.

## Decisions

### 1. Edit times: two columns, set in the writing statement, backfilled from the log
Migration `0018_test_case_edit_times`:
1. `ADD COLUMN updated_at timestamptz` and `script_updated_at timestamptz`.
2. Lift `FORCE ROW LEVEL SECURITY` on `test_case` and `activity_entries` for the backfill, as `0010` and `0016` do.
3. Backfill inside `-- backfill:begin` and `-- backfill:end` markers, so an e2e test can run the statement, as with `0016`:
   - `updated_at`: the latest `test_case.updated` or `test_case.moved` entry for the row, else `created_at`
   - `script_updated_at`: the latest `test_case.updated` entry with `details->'changes' ? 'gherkinScript'`
4. Restore FORCE RLS, then `SET NOT NULL` and `DEFAULT now()` on `updated_at`.

Writers:
- Create sets nothing: both defaults are `now()`, the same instant in one transaction.
- Update sets `updated_at = now()` when the diff isn't empty, and `script_updated_at = now()` when it holds `gherkinScript`. The diff is already computed before the `UPDATE`.
- Move always sets `updated_at = now()`, matching its always-written log entry.

Restore, folder moves and folder renames don't touch either column, since the test case itself didn't change.

Reads add `created_at`, `updated_at` and `script_updated_at` to `TEST_CASE_SELECT`. The responses gain `createdAt`, `updatedAt` and `scriptUpdatedAt` as ISO strings.

**Why not a trigger:** a trigger can't tell an edit from a deletion-column update without restating the diff, and the diff already exists in the controller. This is the same reasoning as `bug.resolved_at`.

### 2. Health rules: a facts query and pure rules, both in `packages/reporting`
`src/test-case-health.ts` holds:
- **The thresholds:** `DORMANT_DAYS = 14`, `TREND_WINDOW = 5`, `TREND_MIN_RUNS = 10`, `TREND_DELTA_PCT = 20`, `MIN_RUNS_TO_RANK = 3`.
- **`TEST_CASE_FACTS_SQL`:** `$1` is the project id; `$2` is a test case id, or `NULL` for every live test case. It returns one row per live test case:
  - `id`, `has_script`
  - `run_count`: runs in live executions, any outcome
  - `completed_count`, `last_completed_at`
  - `completed_before_edit`: whether a completed run was recorded before `script_updated_at`
  - `completed_since_edit`
  - `trend_outcomes`: the latest 10 completed outcomes since the edit (or ever, with no edit), newest first, as a text array
  - `as_of`: `now()`, the database clock
- **`testCaseHealth(facts)`:** returns `{ flags, trend }`. `flags` is an ordered subset of `NoScript`, `Orphan`, `NeverRun`, `Dormant`, `Degrading`, `Improving` and `TrendReset`. `trend` is `{ recentPassPct, previousPassPct }` when Degrading and Improving were evaluated, else null.
- **`ISSUE_FLAGS`:** `NoScript`, `Orphan`, `NeverRun`, `Dormant` and `Degrading`, the dashboard's issues (PRD §6.12.1).

The rules are pure, so the package's Vitest tests cover them, with the specs' scenarios as fixed fact rows. The pass rate counts Needs Review as not passed, as everywhere else. With 5-run windows the rates are multiples of 20, so the comparison is exact.

**Why the SQL lives in the package too:** the Phase 10 worker renders this dashboard's PDF from `pg` (ADR 0006), and a second copy of "which runs count" is how the rules would drift. This follows `AS_OF_COUNTS_SQL`.

**Alternatives:**
- Fetching every completed run and filtering in TypeScript: simpler SQL, but it moves the whole run table per request.
- Computing the flags in SQL: one round trip fewer, but the rules would exist as SQL text, and the package couldn't unit-test them.

### 3. The detail reports `health`; the list doesn't
`loadTestCase` runs the facts query for one id and adds `health: { flags, trend, lastCompletedAt, asOf }` (decision 5 explains the last two) to the detail and to every write's response. The list (`GET …/test-cases`), which feeds the tree, stays as it is: the tree doesn't show health, and a facts row per test case on every tree load isn't needed.

### 4. One dashboard read, declared before `:testCaseId`
`GET /projects/:projectId/test-cases/dashboard?tz=` (Viewer+) lives in `TestCasesController`, declared above `@Get(':testCaseId')`, so Nest matches it first. A test checks that `dashboard` isn't read as an id. The queries go in `src/test-cases/test-case-dashboard.ts`. `parseTimeZone` is imported from `overview/overview-trends.ts`. One `withTenantContext` transaction runs:

1. The facts query for all live test cases, joined in TypeScript with each test case's name, status, tags, folder, `created_at` and `updated_at`.
2. The latest completed outcome per live test case, for the Last Run Outcome donut, using the tree's `lastOutcome` rule.
3. Per test case, completed runs, fails and flaky runs:
   - a flaky run is completed, current outcome `Pass`, with an `EXISTS` on `test_run_attempt` for the same `test_run_id` with `Fail` or `NeedsReview`
   - the rankings are ordered in SQL by the exact ratio, as the Overview's Top Failing is
4. Tag counts over live test cases.
5. The folder paths, from a recursive CTE over live folders.
6. 90 tz days:
   - `created`: live test cases' `created_at`
   - `added`: `test_run.created_at` of live executions
   - `completed` and `passed`: `outcome_updated_at` of completed runs in live executions
   - plus `hasCompletedRuns`

Response:
```ts
{
  tiles: { total, ready, covered, avgConfidencePct: null },
  days: { date, created, added, completed, passed }[],      // 90, oldest first
  hasCompletedRuns: boolean,
  lastOutcome: { pass, fail, needsReview, neverRun },
  sourceType: { gherkin, manual },
  needsAttention: { id, name, tagIds, status, createdAt, updatedAt, issues }[],
  rankings: {
    mostRun:    { id, name, completed }[],
    topFailing: { id, name, failed, completed, failRatePct }[],
    topFlaky:   { id, name, flaky, completed, flakyPct }[],
    topTags:    { tagId, name, color, count }[],
  },
  folderHealth: { folderId, path: string[], cases, withIssues, issuePct, breakdown: Partial<Record<IssueFlag, number>> }[],
}
```

Needs Attention returns every flagged row, and the client filters, sorts and pages it. The table is bounded by the project's test case count, and the PRD's interactions (typing filter, column sorts, "Show N more") are all instant client-side.

**Run scope, recorded as a decision:**
- **Daily run series** (added, completed, passed) count every run of a live execution, including runs of a test case now in the Trash. That matches the Overview's Pass Rate trend, so the two charts agree.
- **Test-case figures** (tiles, donuts, rankings, issues, Folder Health) count live test cases only.

This is Slice 2's rule: execution-level figures keep runs of trashed test cases (PRD §2.11), and test-case figures drop them.

**"Never Run" means two things, recorded so nobody "fixes" one into the other:**
- In the Last Run Outcome donut and the Coverage tile, it means *no completed run*, so it includes Orphans.
- As an issue and a banner, it means *added but none completed*, as PRD §6.2.4's table defines it.

### 5. Web: the dashboard is the right panel when nothing is selected
- **`TestCasesScreen`:** with `selected === null`, it renders `<TestCaseDashboard projectId />` in place of the placeholder.
- **`TestCaseTree`:** its toolbar gains a Dashboard toggle (`aria-pressed`), shown to every role. Pressing it calls `onSelect(null)`. Selection already lives in screen state, so the toggle only clears it, and the `?testCase=` link behaviour is unchanged.
- **Freshness:** the dashboard query uses `staleTime: 0` and `refetchOnMount: 'always'`, under `['projects', id, 'test-cases', 'dashboard', tz]`. Every return to the view refetches (PRD §6.12.4). The key sits under the test case list key, so the existing `invalidateQueries({ queryKey: listKey })` calls after edits also mark it stale.
- **Tile and card:** the Overview's `KpiTile` and `Panel` move to `components/dashboard/` (`stat-tile.tsx`, `section-card.tsx`), and the Overview imports them from there. Slices 5 and 6 need the same PRD §6.12.4 building blocks. The move doesn't change the Overview's markup, so its tests pass unchanged.
- **`test-case-dashboard.tsx`** composes:
  - the tiles
  - the charts: `LineChart` with three series, and the Pass Rate `LineChart` with the Overview's 0-days tooltip text
  - two `DonutChart`s
  - `needs-attention-table.tsx`
  - `rankings.tsx` (a shared ranked-list row)
  - `folder-health-table.tsx`
  - `dashboard-history.tsx`

  Row links are `<a href="/test-cases?testCase=<id>" target="_blank" rel="noopener">`, as on the Overview.
- **The History panel** reads the first page of `activityKeys.project(projectId, 'test-cases')`, the Activity screen's cache. While collapsed it still fetches, since the badge needs the count. It shows 5 entries with `ActivityRow`, and "5+" when the page holds more than 5. "See full history" opens a dialog with `<ActivityFeed type="test-cases" />`, as the Overview's Full History does.
- **`health-banners.tsx`** renders one banner per flag, except No Script, which is not a PRD §6.2.3 banner (the detail already says "Manual test case"):
  - Degrading uses the fail colour; the others use the review colour or a muted one
  - wording from PRD §6.2.3, with the 5-run rates and the Dormant day count from `trend`, `lastCompletedAt` and `as_of`

  To give that day count, `health` also carries `lastCompletedAt` and `asOf`, computed on the server so the banner doesn't depend on the browser clock.

### 6. Seed: edit times, and two script edits that show Trend Reset
- **Dataset:** `DemoTestCase` gains an optional `scriptEdit: { daysAgo, by, previousGherkin }`. Two test cases get one at 6 days ago:
  - `card-3ds`: Fail in `payments-smoke`, which completed 8.9 days ago, with a bug filed from that run
  - `wallet-paypal`: Needs Review in the same execution

  Neither test case is in an execution started after day 6, so both show Trend Reset (a completed run before the edit, none since). `gherkin` stays the current script, and `previousGherkin` is the script before the edit, changed by one visible step.
- **Rows:**
  - `test_case` inserts gain `updated_at` (the edit time, else `created_at`) and `script_updated_at` (the edit time, else null).
  - Each edit adds a `test_case.updated` activity entry: category `Test Cases`, `details: { changes: { gherkinScript: true } }`, the editing teammate and the edit's time, written the way `logTreeActivity` writes it. This keeps the History panel, the Activity screen and the migration's backfill rule in agreement with the columns.
- **Snapshots:** the run loop picks the script for each run's snapshot: `previousGherkin` when the execution started before the edit, else `gherkin`. `runInfo` carries that choice, so bugs filed from those runs snapshot the same script.
- **Idempotence** is unchanged. The ids are deterministic and the seed only adds rows, so a project seeded before this change keeps its rows as they were, and only a fresh seed shows the edits.
- **A dataset check** in `demo-dataset.spec.ts` asserts that each `scriptEdit` comes after a completed run of its test case and before any execution containing it starts. It also asserts that `previousGherkin` differs from `gherkin`, so a later edit to the dataset can't silently break the Trend Reset demo.

### 7. Unranked failing test cases, and seeded runs that fill the rankings
Top Failing's 3-run minimum (PRD §6.12.3) stays. Found in review: on the demo data, every failing test case had 1 or 2 completed runs, so both Top Failing lists were empty, and they read "No failing tests — nice!", which was false.
- **API:** the dashboard's `rankings` and the Overview response each gain `failingBelowMinimum`: live test cases with a Fail and fewer than 3 completed runs, counted with the same run scope as the ranking.
- **Web:** both panels show that count, singular or plural. It replaces the empty line when nothing is listed, and sits below the rows otherwise. "— nice!" shows only when nothing has failed.
- **Seed:**
  - Two Done executions, "Auth regression" (about 13 days ago) and "Search regression" (about 12 days ago), give the sign-in and search test cases a third completed run. Three failing test cases then rank, and two stay below the minimum, so both behaviours show.
  - Neither execution creates bugs automatically, so the dataset's auto-bug rule holds.
  - Neither touches the two script-edited test cases, so Trend Reset holds.
  - The dataset checks move from one execution per status to every status at least once.

**Alternative rejected:** lowering the minimum. That's a PRD threshold change, and the user chose not to make it.

## Risks / Trade-offs

- **[The facts query scans every live test case's runs per dashboard load]** → `test_run_test_case_idx` exists. Projects are hundreds of test cases, not millions. Revisit with an `outcome_updated_at` index if the dashboard slows down.
- **[Health on the detail is a snapshot at read time]** → an outcome recorded on the Executions screen doesn't refresh an open test case detail. It refreshes on the next read, which matches the dashboards' "no live updates" rule (PRD §6.12.4).
- **[Backfill timestamps come from the log]** → entries are written in the change's own transaction (ADR 0007), so they are the change times. A test case with no entries falls back to `created_at`, which is correct for it.
- **[Route ordering]** → `dashboard` must stay above `:testCaseId`. The e2e test fails if the order is ever swapped.
- **[Avg Confidence always "—"]** → that's the PRD's own rule until automated runs exist (§6.12.1). The API already returns the field, so Phase 12 only fills it.

## Migration Plan

1. Apply `0018_test_case_edit_times.up.sql` as `railgun_migrator`, then run `npm run db:check-rls`. The table already has forced RLS, and there are no new tables.
2. Deploy the API, then the web. The new response fields are additive, and the old web ignores them.

**Rollback:** the down migration drops both columns. The API code from before this change never reads them.
