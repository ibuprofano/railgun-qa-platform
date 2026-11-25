# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, turn Phase 9 Slice 4 into a 🚧 entry pointing at the OpenSpec change `test-cases-dashboard`, with the scope and out-of-scope list from proposal.md. Verify that it reads correctly and that every link resolves.

## 2. Edit times

- [x] 2.1 Add migration `0018_test_case_edit_times` (up and down; design.md decision 1), with the backfill between `-- backfill:begin` and `-- backfill:end` markers. Apply it to the dev database as `railgun_migrator` and run `npm run db:check-rls`. Verify that it passes, and that every existing test case now has an `updated_at`.
- [x] 2.2 Maintain and report the edit times in `test-cases.controller.ts`:
  - update sets `updated_at` when the diff isn't empty, and `script_updated_at` when it holds `gherkinScript`
  - move always sets `updated_at`
  - `TEST_CASE_SELECT` and the responses gain `createdAt`, `updatedAt` and `scriptUpdatedAt`

  Extend `test/test-cases.e2e-spec.ts` and verify every edit-time scenario in specs/test-case-authoring:
  - a new test case, where change time equals creation time
  - a tags-only change and a move set the change time
  - an update that changes nothing leaves it
  - a status change leaves the script edit time null
  - a script edit sets both times
  - restoring from the Trash leaves both times unchanged
- [x] 2.3 Add `test/test-case-edit-times-backfill.e2e-spec.ts`, which runs the migration's backfill statement as `bug-resolved-at-backfill.e2e-spec.ts` does. Verify that a script change 6 days ago and a move 2 days ago give a change time of 2 days ago and a script edit of 6 days ago, and that a test case with no entries falls back to `created_at` with no script edit time.
- [x] 2.4 Write the edit times in the demo seed's `test_case` insert (design.md decision 6): `updated_at` is the script edit time or `created_at`, and `script_updated_at` is the edit time or null. Extend `test/demo-seed.e2e-spec.ts` and verify that an unedited seeded test case reports equal creation and change times and no script edit time, and that a rerun still writes nothing.
- [x] 2.5 Add the seeded script edits (design.md decision 6):
  - `scriptEdit` with `previousGherkin` on `card-3ds` and `wallet-paypal` in `demo-dataset.ts`
  - a `test_case.updated` entry for each edit
  - each run's snapshot (and its bugs' snapshots) chosen by whether its execution started before the edit

  Extend `demo-dataset.spec.ts` with the dataset check: each edit after a completed run of its test case and before any later execution containing it starts, with `previousGherkin` different from `gherkin`. Extend `test/demo-seed.e2e-spec.ts` and verify:
  - both test cases report the edit time as their script edit time and last change time
  - the Test Cases activity feed lists both edits with their teammate and time
  - the `payments-smoke` runs and the `card-3ds` bug hold `previousGherkin`
  - a rerun writes nothing

  The Trend Reset check on these rows runs in 3.2.

- [x] 2.6 Add two signed-off regressions to the demo dataset (specs/demo-seed, design.md decision 7): "Auth regression" about 13 days ago and "Search regression" about 12 days ago, both Done, with `autoCreateBug: false`, re-running sign-in and search test cases. Neither may include `card-3ds` or `wallet-paypal`.
  - "Account locks after five failed sign-ins" reaches 3/3 failed, "Search with no results suggests alternatives" 2/3 and "Reset password by email link" 1/3.
  - "Guest checkout with shipping address" and "Pay with a card requiring 3-D Secure" keep a single completed run.

  Relax the dataset check and the seed e2e test from one execution per status to every status at least once, with 8 executions. Verify in `test/demo-seed.e2e-spec.ts` that the seeded Test Cases dashboard lists that Top Failing order (100%, 67%, 33%) and reports 2 failing test cases below the minimum. Also verify that the Overview's Top Failing Tests agrees, and that the dataset and seed tests pass.

## 3. Health rules

- [x] 3.1 Add `packages/reporting/src/test-case-health.ts` (design.md decision 2), exported from `index.ts`:
  - the thresholds, `ISSUE_FLAGS`, the facts row type, `TEST_CASE_FACTS_SQL` and `testCaseHealth(facts)`

  Add `test-case-health.test.ts` with every scenario in specs/test-case-health as fixed fact rows:
  - No Script
  - Orphan versus Never Run, and never both
  - Dormant at 15 days and not at 10
  - Degrading at 40% against 80%, and Improving
  - nothing with 9 runs, or with equal windows
  - Trend Reset with 3 runs since the edit, which suppresses Degrading
  - Trend Reset ending at 10 runs since the edit
  - no Trend Reset when the script was edited before any run

  Verify with `npm test -w packages/reporting`.
- [x] 3.2 Add `health` to `loadTestCase` (design.md decision 3), running the facts query for one id. Add `test/test-case-health.e2e-spec.ts` and verify against real rows:
  - a run of a trashed execution counts as not added (Orphan)
  - a run whose attempt 1 failed and is Pending after Restart is Never Run
  - a run completed 20 days ago gives Dormant on the detail
  - 10 runs at 2/5 against 4/5 give Degrading with rates 40 and 80
  - clearing the script returns No Script in the update's response
  - the list response has no `health`
  - after seeding, `card-3ds` and `wallet-paypal` report Trend Reset (specs/demo-seed)

## 4. API: dashboard read

- [x] 4.1 Add `GET /projects/:projectId/test-cases/dashboard?tz=` (design.md decision 4) in `src/test-cases/test-case-dashboard.ts`, declared above `@Get(':testCaseId')`, with its response type. Add `test/test-case-dashboard.e2e-spec.ts` and verify every scenario in specs/test-case-metrics:
  - a Viewer reads it; another workspace's member gets 403
  - `dashboard` isn't treated as a test case id
  - a trashed test case appears nowhere, and a trashed execution's run counts as never run
  - the tile figures 10 / 6 / 7 / null, and total, Ready share and coverage equal to `GET …/overview`
  - one day's 2 created, 5 added, 3 completed and 2 passed
  - a 23:30 UTC run counted on the next day for `Europe/Madrid`
  - `Mars/Olympus` → 400, and `hasCompletedRuns` false with no completed run
  - the Last Run Outcome and Source Type splits
  - Needs Attention:
    - one row with No Script and Orphan
    - a healthy test case left out
    - Improving and Trend Reset aren't issues
    - Dormant agrees with the detail
  - rankings:
    - Top Failing A (75%) then C (20%), without B
    - a flaky run in Top Flaky
    - Top Tags 5 then 2, without the unused tag
    - ties ordered by name
    - at most 10 rows
  - Folder Health:
    - "Checkout / Payments" with 4 cases, 2 issues (50%), Dormant ×2 and No Script ×1
    - "Cart" before "Login"
    - no row for root test cases

- [x] 4.2 Report the failing test cases below the 3-run minimum (design.md decision 7): `rankings.failingBelowMinimum` on the dashboard, and `failingBelowMinimum` on `GET …/overview`. Extend `test/test-case-dashboard.e2e-spec.ts` (A ranked, B and D unranked → 2) and `test/overview.e2e-spec.ts` (A ranked, B unranked → 1), and verify that both pass.

## 5. Web: shared tiles and the detail banners

- [x] 5.1 Move the Overview's `KpiTile` and `Panel` into `components/dashboard/stat-tile.tsx` and `section-card.tsx` (design.md decision 5), and import them in `overview-screen.tsx`. Verify that `overview-screen.test.tsx` passes unchanged.
- [x] 5.2 Extend `lib/test-cases-api.ts` with `createdAt`, `updatedAt`, `scriptUpdatedAt`, `health`, `getTestCaseDashboard` and its query key under the test case list key. Add `components/test-cases/health-banners.tsx`, shown in `test-case-detail.tsx`. Extend `test-case-detail.test.tsx` and verify the banner scenarios in specs/test-cases-screen:
  - Degrading reads "from 80% to 40%"
  - Orphan's text
  - Dormant names the days since its last run
  - Trend Reset's text
  - no banner for a healthy test case
  - No Script shows no banner

## 6. Web: the dashboard view

- [x] 6.1 Make the dashboard the default right panel (design.md decision 5):
  - a Dashboard toggle (`aria-pressed`) in `test-case-tree.tsx`'s toolbar, for every role, that clears the selection
  - `test-cases-screen.tsx` renders `TestCaseDashboard` when nothing is selected

  Update `screen-states.test.tsx`, which expects the old placeholder. Extend `test-cases-screen.test.tsx` and verify:
  - opening the screen shows the dashboard with the toggle pressed
  - the toggle returns from a detail
  - `?testCase=<id>` shows the detail
  - a folder selection still shows its summary
- [x] 6.2 Add `components/test-cases/test-case-dashboard.tsx`:
  - the loading placeholders (title and four tiles)
  - the empty state
  - the four tiles with tooltips
  - Test Cases Over Time and Pass Rate Trend, the latter hidden without completed runs
  - the two donuts
  - a refetch on every showing

  Add `test-case-dashboard.test.tsx` and verify:
  - the tile texts 10 ("6 ready"), 60% ("6 of 10 cases"), 70% ("3 never run") and "—"
  - the three series' values for one day
  - the full-width Over Time chart without completed runs
  - the donut parts
  - "No test cases yet" with its hint
  - the placeholders while loading
  - a second showing refetches
- [x] 6.3 Add `needs-attention-table.tsx`. Verify in its test:
  - the count and the badge tooltip
  - the name filter, ignoring case
  - the default oldest-first order, with 10 rows and "Show 4 more"
  - Last Updated sorting and reversing
  - red Degrading and amber other badges
  - a row link to `/test-cases?testCase=<id>` with `target="_blank"`
- [x] 6.4 Add `rankings.tsx` and `folder-health-table.tsx`. Verify in their tests:
  - rank numbers
  - "75%" in red with "(3/4)"
  - the flaky share in amber
  - tag rows that aren't links
  - each ranking's empty line
  - "Checkout / Payments" with 4, "2 (50%)" in red and "Dormant ×2"
  - a green "—" with no badges for a folder without issues
- [x] 6.5 Add `dashboard-history.tsx`, using the `test-cases` feed and `ActivityRow`. Verify in its test:
  - collapsed by default
  - 5 entries newest first and the "5+" badge with 12 entries
  - "See full history" opens the dialog with the `test-cases` feed and Load more

- [x] 6.6 Say when failing test cases are too new to rank (design.md decision 7), on the dashboard's Top Failing and the Overview's Top Failing Tests:
  - the count replaces the empty line when nothing is listed, and sits below the rows otherwise, singular or plural
  - "— nice!" shows only with no failing test case

  Extend `rankings.test.tsx` and `overview-screen.test.tsx`, and verify the scenarios in specs/test-cases-screen and specs/overview-screen.

## 7. Integration check

- [x] 7.1 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w apps/api` (with `SECRETS_MASTER_KEY` in the shell), `npm test -w apps/worker`, `npm run test -w apps/web` and `npm test -w packages/reporting`, and verify that all pass. The known flaky worker test `trash-purge.spec.ts` › "runs as the trash_purge job" is recorded in the roadmap; report it if it fails. Also verify that `npm run build -w apps/api` succeeds.
- [x] 7.2 Manual run against the seeded database (`npm run dev`, signed in as the seeded user):
  1. Check that Test Cases opens on the dashboard.
  2. Check that the tiles match the Overview's total, Ready share and coverage.
  3. Check that Needs Attention's rows agree with the banners on two of their test cases, and that a row opens in a new tab.
  4. Check that a folder selection shows its summary, and that the toggle returns to the dashboard.
  5. Check that a test case never added to an execution shows the Orphan banner.
  6. Reseed into a fresh project, since an existing seeded project keeps its old rows. Check that Top Failing on both the dashboard and the Overview lists "Account locks after five failed sign-ins" first, and says 2 failing test cases aren't ranked yet.
  7. In the fresh project, check that `card-3ds` shows the Trend Reset banner, that its `payments-smoke` run shows the earlier script, and that the edit appears in the Test Cases history.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 4 entry to ✅, with what was built, key decisions and anything deferred.
