# Proposal

## Why

Phase 10 Slice 2 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the first report end to end. Slice 1 settled how PDFs are rendered ([ADR 0026](../../../docs/adr/0026-report-rendering-library-and-fonts.md): pdfmake, Noto fonts, a 30 s job). Nothing yet requests a report, generates it in the background, stores it, or delivers it, and every dashboard's Download button is disabled.

[ADR 0006](../../../docs/adr/0006-report-generation.md) decision 6 puts finished files in object storage behind a short-lived signed link. The storage provider (E3) waits on hosting and region decisions (E1, E2, E4), so this slice stores files in Postgres behind a swappable store. Moving to S3 or R2 later then changes one adapter.

The Bugs dashboard PDF is the first report. It has no filters and one range, and every figure it shows already comes from `packages/reporting` (Slice 6 of Phase 9).

## What Changes

- **Storage decision (new ADR 0027, amending ADR 0006 decision 6 and settling D3):**
  - Report files are stored in a Postgres `report_file` table behind a `ReportStore` interface, the same swap point ADR 0004 uses for keys.
  - The file is served by an authenticated API route instead of a signed link.
  - Reports expire after 7 days and are removed by the daily purge.
  - Fonts reach the worker through a checksummed fetch script.
- **Data (migration `0019_report`):**
  - a `report` table: who asked, which report, its options, its status (`Queued`, `Generating`, `Ready`, `Failed`), its error, and when it was created, completed and expires
  - `report_file` for the bytes
  - forced RLS on both
  - grants: the API creates and reads reports and reads files; the worker updates status, writes files, deletes expired reports, and reads bugs, tags and bug tags
  - `enqueue_job` adds `report_generate` to its allow-list, with 3 attempts
- **API:**
  - `POST /projects/:projectId/reports` (Viewer+): validates the kind (`bugs-dashboard`), the time zone and the range; creates the report; enqueues `report_generate` in the same transaction
  - `GET /projects/:projectId/reports/:reportId`: the report's status
  - `GET /projects/:projectId/reports/:reportId/file`: the PDF, logging `report.downloaded` in the same transaction

  A report is visible to its requester only; anyone else gets 404.
- **Worker:** a `report_generate` task:
  1. marks the report Generating
  2. reads the Bugs dashboard rows under the tenant context, with the requester's time zone
  3. builds the report data with `packages/reporting`
  4. renders it with pdfmake under ADR 0026's rules (no remote fetching, Noto fonts, a 30 s timeout)
  5. stores the file and marks the report Ready, or Failed after the last attempt

  Each status change emits a `report.changed` live event. The daily `trash_purge` also deletes expired reports.
- **Shared data assembly in `packages/reporting`:** `bugReportData(dashboard, options)` gathers every figure the PDF prints, with print colours, so the PDF uses the same rules as the screen. It contains no secrets and no trashed items.
- **Fonts:** `npm run fonts -w apps/worker` downloads the three pinned Noto files into `apps/worker/fonts/` (gitignored) and verifies their SHA-256. The worker refuses to start report jobs without them.
- **Web:**
  - Download report on the Bugs dashboard is enabled. It requests the report with the browser's zone and the selected range, then shows "Generating…".
  - The web follows the report through the live event, polling as a fallback, and downloads the file through the authenticated client when it's Ready.
  - On failure it shows "The report couldn't be generated." with Try again.
- **Activity:** `report.downloaded` entries read "downloaded the Bugs dashboard report", in the All feed.
- **Docs:** ADR 0027; `open-questions.md` resolves D3; the roadmap gets the Slice 2 entry; CLAUDE.md gets the font setup step.

## Capabilities

### New Capabilities
- `report-generation`: requesting a report, the generation job and its states, storage and expiry, who can read and download it, and the logging of downloads.
- `bugs-dashboard-report`: what the Bugs dashboard PDF contains, and that it matches the screen for the same zone and range.

### Modified Capabilities
- `bugs-screen`: Download report is enabled, with generating, ready and failed states.
- `live-updates`: a `report.changed` event; the identifiers-only rule names the report id.

`background-jobs` needs no delta: its allow-list and least-privilege requirements hold as written, and the report job's retries and expiry are specified in `report-generation`.

## Impact

- **DB:** migration `0019_report` (two tables, RLS, grants, a new `enqueue_job` body). `db:check-rls` must pass.
- **Packages:** `packages/reporting/src/bug-report.ts` (data assembly, print colours), with tests.
- **API:**
  - `src/reports/` (controller, queries, `ReportStore` with its Postgres adapter, input rules)
  - `live-event.ts` gains `report.changed`
  - the module is registered in `app.module.ts`
- **Worker:**
  - `pdfmake` dependency
  - `src/tasks/report-generate.ts`
  - `src/reports/` (document builder, font setup, store)
  - `scripts/fetch-fonts.js`
  - the trash purge deletes expired reports
- **Web:**
  - `lib/reports-api.ts`
  - a `useReportDownload` hook
  - the Bugs dashboard header
  - the live provider handles `report.changed`
  - the activity sentence
- **Dependencies:** `pdfmake` in `apps/worker`.
- **Out of scope:**
  - the other five reports, and enabling the Overview, Test Cases and Executions download buttons (later slices)
  - S3 or R2 storage and signed links (E3)
  - images in reports (D2)
  - a list of past reports in the UI
  - deleting a report by hand
