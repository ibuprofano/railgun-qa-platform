# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, add a Phase 10 Slice 3 🚧 entry pointing at the OpenSpec change `executions-dashboard-report`, with the scope and out-of-scope list from proposal.md. Verify that it reads correctly and that its links resolve.

## 2. Shared kinds and data in `packages/reporting`

- [x] 2.1 Add `src/report-kinds.ts` with `REPORT_KINDS`, `ReportApiKind`, `ReportDbKind` and `REPORT_KIND_LABELS` (design.md decision 1), and move `ReportDonut` and its `donut()` helper into `src/report-parts.ts`, reused by `bug-report.ts`. Export both from `src/index.ts`. Verify that `bug-report.test.ts` passes unchanged.
- [x] 2.2 Add `src/execution-report.ts` with `executionReportData` and the print colours for execution statuses and outcomes (design.md decision 5). Add `execution-report.test.ts`:
  - filtering by environment scopes the tiles, charts and donuts as `scopeDashboard` does
  - each chart covers its own range
  - Needs Attention with only Runs on gives Needs Review runs and no executions
  - a day filter sorted by bugs gives that day's runs, most bugs first, named "4 Mar · Failed"
  - tag filters are named with their tag names

  Verify `npm test -w packages/reporting` and the package build pass.

## 3. Database

- [x] 3.1 Write `db/migrations/0020_report_kinds.up.sql` and `.down.sql` (design.md decision 3). Apply them to the dev database as `railgun_migrator`, and verify that up, down and up again all run cleanly and that the RLS check passes.

## 4. API

- [x] 4.1 Turn `src/reports/report-rules.ts` into a per-kind validator using `REPORT_KINDS` (design.md decision 2), with the executions-dashboard parser. Read the activity name and category from `REPORT_KIND_LABELS` in the controller and queries. Add `report-rules.spec.ts`:
  - a full executions request parses and is cleaned by `buildReportOptions`
  - both switches off is refused
  - an unknown status, browser, outcome, tab or sort key, a bad tag id, a malformed day, and a range of 45 are each refused

  Verify `npm test -w apps/api -- report-rules` passes.
- [x] 4.2 Extend `test/reports.e2e-spec.ts`:
  - an Executions dashboard request with a filter, the All Runs tab, ranges 30 and 7, and both switches on gives 201, and its options are kept
  - both switches off gives 400 and creates nothing
  - downloading a Ready Executions report logs "Executions dashboard report"

  Verify `npm test -w apps/api` passes (with `SECRETS_MASTER_KEY` in the shell).

## 5. Worker

- [x] 5.1 Add `src/reports/kinds.ts` with the builder per kind (design.md decision 4). Move the Bugs builder into it, and have `generateReport` dispatch on the claimed kind and name the file from `REPORT_KIND_LABELS`. Verify that `report-generate.spec.ts` still passes.
- [x] 5.2 Add `src/reports/executions-dashboard-document.ts` (design.md decision 6) and the executions builder. Extend `report-generate.spec.ts`:
  - an Executions report filtered to an environment becomes Ready, named `executions-dashboard-<day>.pdf`, and its definition counts only that environment's executions, while a trashed execution is absent
  - with only Runs on, there is no executions table

  Extend `render-pdf.spec.ts`: the executions document renders as a PDF. Verify `npm test -w apps/worker` passes, apart from the known flaky `trash_purge` job test.

## 6. Web

- [x] 6.1 Type `useReportDownload` by kind (design.md decision 7), and update `reports-api.test.tsx`. Verify that the web typecheck passes.
- [x] 6.2 Wire `ExecutionDashboard` and `ExportDialog`:
  - Download PDF requests the report with the dialog's options
  - it reads "Generating…" and is disabled while generating
  - on failure the dialog shows the failure line with Try again
  - the dialog closes after the download
  - the "not available yet" note goes

  Update `export-dialog.test.tsx` and `execution-dashboard.test.tsx` for the specs/executions-screen scenarios:
  - both switches off
  - before report generation
  - requesting the report (status Done, Runs Over Time 7, Runs on)
  - generating, then downloaded
  - the report fails, and Try again

  Verify `npm run test -w apps/web` passes.

## 7. Integration

- [x] 7.1 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w packages/reporting`, `npm test -w apps/api`, `npm test -w apps/worker`, `npm run test -w apps/web`, `npm run build -w apps/api` and `npm run build -w apps/worker`, and verify that all pass, apart from the known flaky worker test, which is to be reported if it fails.
- [x] 7.2 Manual run (`npm run dev`, seeded project):
  1. Filter the Executions list by an environment, select a Failed segment in Runs Over Time, and open the export dialog.
  2. Turn Runs on, and press Download PDF.
  3. Check that "Generating…" shows, then a PDF downloads.
  4. Check that its filters, tiles, both charts for their ranges, donuts, executions and runs tables match the screen.
  5. Check that the Activity feed lists the download.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 3 entry to ✅, with what was built, key decisions and anything deferred.
