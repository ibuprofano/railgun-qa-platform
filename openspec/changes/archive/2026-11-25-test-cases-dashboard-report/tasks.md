# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, add a Phase 10 Slice 4 🚧 entry pointing at the OpenSpec change `test-cases-dashboard-report`, with the scope and out-of-scope list from proposal.md. Verify that it reads correctly and that its links resolve.

## 2. Move the dashboard into `packages/reporting`

- [x] 2.1 Add `src/test-case-dashboard.ts` with the six dashboard queries, their row types, `testCaseDashboardFromRows` and the dashboard types, moved from `apps/api/src/test-cases/test-case-dashboard.ts` (design.md decision 1). Use `DASHBOARD_DAYS` in place of the API's `TREND_DAYS`. Export it from `src/index.ts`. Reduce the API's `loadTestCaseDashboard` to running the queries with `$queryRawUnsafe` and returning `testCaseDashboardFromRows(...)`. Verify that `test/test-case-dashboard.e2e-spec.ts` and `npm test -w apps/api -- test-case` pass unchanged.
- [x] 2.2 Add `NeedsAttentionState`, `DEFAULT_NEEDS_ATTENTION`, `filterNeedsAttention` and `sortNeedsAttention`, the comparator moved from `needs-attention-table.tsx`, and move `ISSUE_LABELS` and `unrankedFailingText` into the package, re-exported from their web files. Add `test-case-dashboard.test.ts`:
  - the default order is created time, oldest first
  - sorting by issue follows the rules' flag order
  - `desc` reverses the order
  - the name filter ignores case and surrounding spaces

  Verify `npm test -w packages/reporting` and the package build pass.

## 3. Report kind and data

- [x] 3.1 Add `test-cases-dashboard` to `REPORT_KINDS` and `REPORT_KIND_LABELS` (design.md decision 2). Verify that the API and worker typecheck fails until each side has its entry, then proceed (tasks 4.1 and 5.1 add them).
- [x] 3.2 Add `src/test-case-report.ts` with `TestCaseReportOptions`, `PRINT_SOURCE_TYPE_COLORS` and `testCaseReportData` (design.md decision 4). Add `test-case-report.test.ts`:
  - each chart covers its own range
  - with no completed run there is no Pass Rate Trend
  - Avg Confidence reads "—"
  - a "pay" filter sorted by Last Updated, descending, lists only matching rows, newest change first, and names "Name: pay"
  - 14 flagged rows with no filter are all listed
  - Top Failing reads "75% (3/4)", and the unranked line appears when `failingBelowMinimum > 0`
  - tag names come from `tagName`

  Verify `npm test -w packages/reporting` passes.

## 4. Database and API

- [x] 4.1 Write `db/migrations/0021_test_cases_report_kind.up.sql` and `.down.sql` (design.md decision 3). Apply them to the dev database as `railgun_migrator`, and verify that up, down and up again all run cleanly.
- [x] 4.2 Add `parseTestCaseReportOptions` to `src/reports/report-rules.ts` and register it in `PARSERS` (design.md decision 2). Extend `report-rules.spec.ts`:
  - a full request parses, with an absent name stored as `''`
  - each of these is refused: a missing `needsAttention`, a sort key of `folder`, a direction of `up`, a 201-character name, and a range of 45

  Verify `npm test -w apps/api -- report-rules` passes.
- [x] 4.3 Extend `test/reports.e2e-spec.ts`:
  - a Test Cases dashboard request with ranges 30 and 7, filter "pay" and sort Last Updated descending gives 201 and keeps its options
  - a sort by `folder` gives 400 and creates nothing
  - downloading a Ready Test Cases report logs "Test Cases dashboard report" under Test Cases

  Verify `npm test -w apps/api` passes (with `SECRETS_MASTER_KEY` in the shell).

## 5. Worker

- [x] 5.1 Add the `test_cases_dashboard` builder to `src/reports/kinds.ts` and `src/reports/test-cases-dashboard-document.ts` (design.md decision 5). Extend `report-generate.spec.ts`:
  - a Test Cases report becomes Ready, named `test-cases-dashboard-<day>.pdf`
  - its definition's tiles equal `loadTestCaseDashboard`'s figures for the same project and zone
  - a trashed test case with an issue is neither counted nor listed
  - with a name filter, only matching Needs Attention rows appear

  Extend `render-pdf.spec.ts`: the Test Cases document renders as a PDF, with and without Pass Rate Trend. Verify `npm test -w apps/worker` passes, apart from the known flaky `trash_purge` job test.

## 6. Web

- [x] 6.1 Add `'test-cases-dashboard': TestCaseReportOptions` to `ReportOptionsByKind`, and make `test-cases-api.ts`'s `TestCaseDashboard` a re-export of the package type. Verify that the web typecheck passes.
- [x] 6.2 Make `NeedsAttentionTable` controlled, on the package's filter and sort (design.md decision 6). Verify that `needs-attention-table.test.tsx` passes unchanged apart from rendering through a stateful wrapper.
- [x] 6.3 In `TestCaseDashboard`, keep both chart ranges and the Needs Attention state, and add the header with Download report and its Generating, failed and Try again states. Update `test-case-dashboard.test.tsx` for the specs/test-cases-screen scenarios:
  - before report generation
  - requesting the report (ranges 30 and 7, filter "pay", Last Updated twice)
  - Pass Rate Trend hidden
  - generating, then downloaded
  - the report fails, and Try again

  Verify `npm run test -w apps/web` passes.

## 7. Integration

- [x] 7.1 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w packages/reporting`, `npm test -w apps/api`, `npm test -w apps/worker`, `npm run test -w apps/web`, `npm run build -w apps/api` and `npm run build -w apps/worker`, and verify that all pass, apart from the known flaky worker test, which is to be reported if it fails.
- [x] 7.2 Manual run (`npm run dev`, seeded project):
  1. Open Test Cases with nothing selected.
  2. Set the two charts to different ranges, filter and sort Needs Attention, and press Download report.
  3. Check that "Generating…" shows, then a PDF downloads.
  4. Check that its tiles, charts and their ranges, donuts, Needs Attention rows and order, rankings and Folder Health match the screen.
  5. Check that the Activity feed lists the download under Test Cases.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 4 entry to ✅, with what was built, key decisions and anything deferred.
