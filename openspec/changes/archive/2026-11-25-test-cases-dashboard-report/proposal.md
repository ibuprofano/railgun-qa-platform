# Proposal

## Why

Phase 10 Slice 4 ([roadmap-full.md](../../../docs/roadmap-full.md)) adds the Test Cases dashboard PDF (PRD §8, §6.2.4). It is the third report on the pipeline Slice 2 built ([ADR 0027](../../../docs/adr/0027-report-storage-and-delivery.md)) and the registry Slice 3 introduced.

Unlike the Bugs and Executions dashboards, the Test Cases dashboard is still assembled inside the API (`apps/api/src/test-cases/test-case-dashboard.ts`), with Prisma tagged-template queries. The worker can't import from the API. So this slice first moves the dashboard's queries and figures into `packages/reporting`, as the Bugs dashboard already is, and then builds the PDF on them, so the screen and the report can't disagree (PRD §8).

The dashboard has no Download button yet. Its two charts keep their ranges to themselves, and Needs Attention keeps its filter and sort to itself, so the screen can't yet tell a report what it is showing.

## What Changes

- **The dashboard moves into `packages/reporting`** (`test-case-dashboard.ts`), with no behaviour change:
  - its queries become positional SQL constants
  - its figures become a pure `testCaseDashboardFromRows`
  - Needs Attention's name filter and column sort move with it, so the screen and the PDF filter and sort the same way
  - the issue labels and the "too new to rank" line move with them

  The API's `loadTestCaseDashboard` becomes a thin loader over them, as `loadBugDashboard` is. The existing dashboard e2e tests guard the move.
- **A `test-cases-dashboard` report kind** in the registry: "Test Cases dashboard report", file `test-cases-dashboard-<day>.pdf`, activity category Test Cases.
- **Test Cases report options**, checked on request:
  - the zone
  - `ranges.overTime` and `ranges.passRate`, each 7, 15, 30 or 90
  - `needsAttention.name`, at most 200 characters, and `needsAttention.sort`: a column (name, issue, status, created, last updated) and a direction

  Anything else is refused with HTTP 400 and nothing is created.
- **Data (migration `0021_test_cases_report_kind`):** `report.kind` also allows `test_cases_dashboard`. The worker can already read every table the dashboard reads, so no grant is needed.
- **Shared report data:** `testCaseReportData(dashboard, options, { projectName, tagName })` builds:
  - the four tiles
  - Test Cases Over Time and Pass Rate Trend, each for its range, with Pass Rate Trend left out when no run has completed, as on screen
  - the Last Run Outcome and Source Type donuts
  - every Needs Attention row matching the name filter, in the screen's sort order, with the filter named
  - the four rankings and Folder Health
- **Worker:** a `test_cases_dashboard` builder reads the dashboard's rows in the requester's zone and the tag names, and renders the PDF with the same thread, fonts and limits as the other reports.
- **Web:**
  - the dashboard gets a header with **Download report**, as the Bugs dashboard has, with the Generating and failure states
  - the dashboard keeps both chart ranges and the Needs Attention filter and sort, so the request carries what the screen shows
- **Activity:** `report.downloaded` entries name "Test Cases dashboard report", under Test Cases.
- **Docs:** the roadmap gets the Slice 4 entry.

## Capabilities

### New Capabilities
- `test-cases-dashboard-report`: what the Test Cases dashboard PDF contains, how the on-screen ranges and Needs Attention filter shape it, and that it matches the screen.

### Modified Capabilities
- `report-generation`: requests accept the `test-cases-dashboard` kind and validate its options; download entries name it.
- `test-cases-screen`: the dashboard gets a header with Download report, which generates and downloads the report.

## Impact

- **DB:** migration `0021_test_cases_report_kind` (the kind check only).
- **Packages:**
  - `packages/reporting/src/test-case-dashboard.ts` (moved from the API), with tests for the filter and sort
  - `test-case-report.ts`, with tests
  - `report-kinds.ts` gains the kind
- **API:**
  - `src/test-cases/test-case-dashboard.ts` becomes a loader over the package
  - `src/reports/report-rules.ts` gains the parser, with tests
  - `test/reports.e2e-spec.ts` gains scenarios
- **Worker:** `src/reports/kinds.ts` gains the builder; new `test-cases-dashboard-document.ts`.
- **Web:**
  - `components/test-cases/test-case-dashboard.tsx` gets the header and keeps the ranges and table state
  - `needs-attention-table.tsx` becomes controlled and uses the package's filter and sort
  - `lib/reports-api.ts` gets the kind's options type
- **Out of scope:**
  - the Overview PDF and the execution HTML/PDF report (later slices)
  - the dashboard's recent history in the PDF, which PRD §8 doesn't list for this report
  - images (D2), object storage (E3), live updates for the dashboard
