# Spec Delta

## MODIFIED Requirements

### Requirement: Download PDF waits for report generation
The dialog's **Download PDF** SHALL be disabled while both switches are off. Pressing it SHALL request the Executions dashboard report with the options the dialog shows: the list filters, the runs-table state, both chart ranges, the two switches and the viewer's time zone.

#### Scenario: Both switches off
- **WHEN** the member turns off both switches
- **THEN** Download PDF is disabled

#### Scenario: Before report generation
- **WHEN** the member opens the dialog with Test Executions on
- **THEN** Download PDF is enabled, with no note that PDF export is unavailable

#### Scenario: Requesting the report
- **WHEN** the member filters the list to status Done, sets Runs Over Time to 7 days, turns Runs on and presses Download PDF
- **THEN** an Executions dashboard report is requested with that filter, range 7 for Runs Over Time and both switches on

## ADDED Requirements

### Requirement: Download PDF shows the report's progress and downloads it when ready
While the requested report is Queued or Generating, Download PDF SHALL read "Generating…" and be disabled. When the report becomes Ready, the browser SHALL download the PDF. If the report fails or the request is refused, the dialog SHALL say "The report couldn't be generated." with a Try again button.

#### Scenario: Generating, then downloaded
- **WHEN** a member presses Download PDF and the report becomes Ready
- **THEN** the button reads "Generating…" until then and the PDF is downloaded

#### Scenario: The report fails
- **WHEN** the requested report ends Failed
- **THEN** the dialog shows "The report couldn't be generated." and Try again requests a new report
