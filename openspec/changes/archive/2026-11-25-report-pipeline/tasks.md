# Tasks

## 1. Decision and docs

- [x] 1.1 Write `docs/adr/0027-report-storage-and-delivery.md`, amending ADR 0006 decision 6:
  - files in a Postgres `report_file` table behind `ReportStore`, as the stand-in until E3
  - downloads through an authenticated API route, readable by the requester only
  - 7-day expiry removed by the daily purge (D3)
  - fonts fetched with a checksummed script
  - revisit triggers: E3 decided, or report storage growing large

  Add "amended by ADR 0027" to ADR 0006's header, move D3 to `open-questions.md`'s resolved table, and add a Phase 10 Slice 2 🚧 entry to `docs/roadmap-full.md` pointing at the OpenSpec change `report-pipeline`. Verify that every link resolves.

## 2. Database

- [x] 2.1 Write `db/migrations/0019_report.up.sql` and `.down.sql` (design.md decision 1):
  - `report` and `report_file` with forced RLS and the `tenant_isolation` policy
  - the grants for `railgun_app` and `railgun_worker`
  - the `expires_at` index
  - the new `enqueue_job` body (allow-list plus `report_generate` with `max_attempts => 3` and the `report:<id>` job key)

  The down migration restores 0014's body. Apply it to the dev database, and verify that `npm run db:check-rls` passes and that the down and up migrations both run cleanly.
- [x] 2.2 Extend the worker's `enqueue.spec.ts`:
  - `report_generate` enqueues with 3 max attempts
  - enqueuing the same report twice queues one job
  - an unknown task is still refused

  Verify `npm test -w apps/worker` passes, apart from the known flaky `trash_purge` job test.

## 3. Report data in `packages/reporting`

- [x] 3.1 Add `src/bug-report.ts` with `bugReportData` and the print colour maps (design.md decision 6), exported from `src/index.ts`. Add `bug-report.test.ts`:
  - the tiles equal `bugTiles`
  - both chart SVGs cover exactly `range` days and use short day labels
  - the donut legends' counts and percentages match the splits, with zero parts left out
  - tags are sorted by count, then name
  - Needs Attention matches `needsAttention`, with its badges
  - a Japanese tag and title pass through unchanged

  Verify `npm test -w packages/reporting` and the package build pass.

## 4. API

- [x] 4.1 Add `src/reports/` (design.md decisions 2 and 3):
  - input rules (kind, zone, range)
  - queries (create with `enqueue_job` in the same transaction; the requester and expiry lookup)
  - the Postgres `ReportStore` read adapter
  - the controller with the three routes, logging `report.downloaded` on download
  - `ReportsModule`, registered in `app.module.ts`

  Verify that the API builds.
- [x] 4.2 Extend `src/realtime/live-event.ts` with `report.changed`, and make `parseLiveEvent` check the required ids per type (design.md decision 8). Extend its spec: a `report.changed` payload parses, and one missing `reportId` is rejected. Verify that the API unit tests pass.
- [x] 4.3 Add `test/reports.e2e-spec.ts` covering specs/report-generation:
  - a Viewer requests and gets 201 Queued, with one job queued
  - another workspace's member gets 403
  - an unknown kind, an unknown zone and range 45 each give 400 and create nothing
  - the requester reads the status; another project member gets 404
  - the file of a Generating report gives 409
  - a Ready report (bytes inserted as the worker would) downloads as `application/pdf` with its file name and length, and writes one `report.downloaded` entry that the project feed lists
  - an expired report gives 404

  Verify `npm test -w apps/api` passes (with `SECRETS_MASTER_KEY` in the shell).

## 5. Worker

- [x] 5.1 Add `pdfmake` to `apps/worker`. Add `scripts/fetch-fonts.js` with the three pinned files and their SHA-256 values (design.md decision 7), the `fonts` npm script, `apps/worker/fonts/` in `.gitignore`, `REPORT_FONTS_DIR`, and the start-up check in `main.ts`. Verify that the script downloads and verifies the files, that a corrupted file makes it exit non-zero, and that a second run downloads nothing.
- [x] 5.2 Add `src/reports/`:
  - `render-pdf.ts` and `pdf-thread.js`: worker thread, URL policy off, local policy limited to the fonts, 30 s terminate (design.md decision 5)
  - `bugs-dashboard-document.ts`: the pdfmake definition from `bugReportData`
  - the Postgres `ReportStore` write adapter
  - `live-event.ts`: `pg_notify` on the shared channel

  Add specs:
  - a rendered Bugs dashboard document is a PDF (starts with `%PDF`) and contains the Japanese tag's glyphs (pdfmake's text in the content stream decodes to it)
  - a definition referencing a remote image URL is refused
  - a render that never ends is terminated at the timeout, with the timeout shortened for the test

  Verify `npm test -w apps/worker` passes.
- [x] 5.3 Add `src/tasks/report-generate.ts` (design.md decision 4) and register it in `tasks/index.ts`. Add `report-generate.spec.ts` against the docker-compose database:
  - a Queued report becomes Ready with a file whose figures match `bugDashboardFromRows` for the same rows
  - a trashed bug is absent from the file's data
  - a failure before the last attempt rethrows and leaves the report Generating
  - a failure on the last attempt marks it Failed with a reason and doesn't throw
  - missing fonts fail with "Report fonts are not installed"
  - each status change sends one `report.changed` notification
  - an expired report is skipped

  Verify `npm test -w apps/worker` passes.
- [x] 5.4 Extend `trash_purge` to delete expired reports per workspace (design.md decision 10). Extend `trash-purge.spec.ts`: an expired report and its file are deleted, a current one is kept, and its download entries remain. Verify `npm test -w apps/worker` passes.

## 6. Web

- [x] 6.1 Add `requestBlob` to `ApiClient`, and `lib/reports-api.ts` with its keys and `useReportDownload` (design.md decision 9). Add tests:
  - `requestBlob` sends the bearer token and reads the file name
  - the hook polls while Queued or Generating, downloads once when Ready, and exposes the failure

  Verify `npm run test -w apps/web` passes.
- [x] 6.2 Handle `report.changed` in `lib/live-updates.tsx` by invalidating that report's query. Extend `live-updates.test.ts`. Verify that the web tests pass.
- [x] 6.3 Enable Download report on the Bugs dashboard: request with the browser's zone and the chart range, show "Generating…", show the failure line with Try again, and remove the "not available yet" note. Add `report.downloaded` to `activity-format.ts`. Update `bug-dashboard.test.tsx` and `activity-format.test.ts` for the specs/bugs-screen scenarios:
  - requesting the report with range 15
  - generating, then downloaded
  - the report fails, and Try again
  - the stream is down (polling finishes it)

  Verify that the web tests pass.

## 7. Integration

- [x] 7.1 Add the font step to CI (`.github/workflows/ci.yml`, cached on the script's hash) and to CLAUDE.md's setup notes. From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w packages/reporting`, `npm test -w apps/api`, `npm test -w apps/worker`, `npm run test -w apps/web` and `npm run build -w apps/api`, and verify that all pass, apart from the known flaky worker test, which is to be reported if it fails.
- [x] 7.2 Manual run (`npm run dev`, seeded project):
  1. Press Download report on the Bugs dashboard.
  2. Check that "Generating…" shows, then a PDF downloads.
  3. Check that its tiles, charts for the selected range, donuts, Avg Resolution Time, tags and Needs Attention match the screen, Japanese text included.
  4. Check that the Activity feed lists the download.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 2 entry to ✅, with what was built, key decisions and anything deferred.
