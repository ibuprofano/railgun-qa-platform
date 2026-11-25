# Proposal

## Why

Phase 10 Slice 3 ([roadmap-full.md](../../../docs/roadmap-full.md)) adds the Executions dashboard PDF (PRD §8, §6.3.6), the second report on the pipeline Slice 2 built ([ADR 0027](../../../docs/adr/0027-report-storage-and-delivery.md)).

Phase 9 Slice 5 already built the Executions dashboard's export dialog: the Test Executions and Runs switches, the filters notice, and `ExecutionReportOptions`, the contract for this PDF. Its Download PDF button is the only thing still disabled.

The pipeline handles a single kind, `bugs_dashboard`. Its options, its document builder and its labels are hard-wired. This slice makes it handle several kinds while there is only one to generalise from. After that, each later report adds an entry rather than editing the pipeline.

## What Changes

- **Report kinds become a registry.** Each kind declares:
  - its API name and stored name
  - its options validator
  - its activity name and category
  - its file name
  - its worker builder

  `bugs-dashboard` moves into the registry unchanged. `executions-dashboard` is added.
- **Executions report options**, checked on request against `ExecutionReportOptions`:
  - the zone
  - the list filters (name, status, environment, browser, tag ids)
  - the runs-table state (tab, outcome, day and outcome, name, sort)
  - both chart ranges, each 7, 15, 30 or 90
  - the two switches, at least one of them on

  Anything else is refused with HTTP 400 and nothing is created. The request body stays flat (`{ kind, …options }`), so the Bugs request is unchanged.
- **Data (migration `0020_report_kinds`):**
  - `report.kind` also allows `executions_dashboard`
  - the worker gets SELECT on `test_run_attempt` and `test_case_tag`, which the execution dashboard queries need
- **Shared data assembly in `packages/reporting`:** `executionReportData(dashboard, options, { projectName, tagName })` takes the dashboard's execution and run rows, scopes them with the list filter, and builds:
  - the tiles
  - Executions Over Time (line) and Runs Over Time (stacked bars), each for its own range
  - the Execution Status and Run Outcomes donuts
  - the executions in scope, when that switch is on
  - the runs matching the runs-table filter, in its sort order, when that switch is on
  - the active filters, named

  It reuses the dashboard's own functions, and gains print colours for execution statuses and outcomes.
- **Worker:**
  - `report_generate` picks its builder by kind
  - the executions builder reads the dashboard rows in the requester's zone and the tag names
  - it renders the PDF with the same thread, fonts and rules as the Bugs report
- **Web:**
  - Download PDF in the export dialog becomes live: it requests the report with the options the dialog already builds, reads "Generating…" until the file is ready, then downloads it, and shows an error with Try again if it fails
  - the "not available yet" note goes
  - `useReportDownload` takes each kind's options type
- **Activity:** `report.downloaded` entries name "Executions dashboard report", under Executions.
- **Docs:** the roadmap gets the Slice 3 entry.

## Capabilities

### New Capabilities
- `executions-dashboard-report`: what the Executions dashboard PDF contains, how the export switches and filters shape it, and that it matches the screen.

### Modified Capabilities
- `report-generation`: requests name one of several kinds, and each kind validates its own options.
- `executions-screen`: Download PDF generates and downloads the report, with Generating and failed states.

## Impact

- **DB:** migration `0020_report_kinds` (the kind check and two grants).
- **Packages:** `packages/reporting/src/execution-report.ts`, with tests.
- **API:**
  - `src/reports/report-rules.ts` becomes the kind registry, with the executions options validator and its tests
  - `report-queries.ts` and `reports.controller.ts` read labels from the registry
- **Worker:**
  - `src/reports/kinds.ts` (builder per kind)
  - `executions-dashboard-document.ts`
  - `report-generate.ts` dispatches by kind
- **Web:**
  - `lib/reports-api.ts` gets typed options per kind
  - `components/executions/export-dialog.tsx` and `execution-dashboard.tsx` wire the download
  - the activity sentence needs no change, since it reads the stored name
- **Out of scope:**
  - the Overview and Test Cases dashboard PDFs, and the execution HTML/PDF report (later slices)
  - images (D2)
  - object storage (E3)
  - live updates for the dashboard
