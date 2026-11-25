# Spec Delta

## MODIFIED Requirements

### Requirement: The Bugs dashboard has a header with Download report
The dashboard SHALL start with the heading "Dashboard", the line "Aggregate bug metrics for this project" and a **Download report** button. Pressing it SHALL request the Bugs dashboard report with the viewer's time zone and the range selected on the Reported vs Resolved charts.

#### Scenario: Before report generation
- **WHEN** a member opens the dashboard of a project with bugs and has not requested a report
- **THEN** Download report is shown and enabled, with no note that PDF export is unavailable

#### Scenario: Requesting the report
- **WHEN** a member sets the charts to 15 days and presses Download report
- **THEN** a Bugs dashboard report is requested with range 15 and the browser's time zone

## ADDED Requirements

### Requirement: Download report shows the report's progress and downloads it when ready
While the requested report is Queued or Generating, the button SHALL read "Generating…" and be disabled. When the report becomes Ready, the browser SHALL download the PDF and the button SHALL return to Download report. If the report fails, or the request is refused, the dashboard SHALL say "The report couldn't be generated." with a Try again button that requests it again.

#### Scenario: Generating, then downloaded
- **WHEN** a member presses Download report and the report becomes Ready
- **THEN** the button reads "Generating…" until then, the PDF is downloaded, and the button reads Download report again

#### Scenario: The report fails
- **WHEN** the requested report ends Failed
- **THEN** the dashboard shows "The report couldn't be generated." and Try again requests a new report

### Requirement: The dashboard learns of a finished report without a reload
The dashboard SHALL notice that the report has finished from the project's live events, and SHALL also check the report's status every few seconds while it is generating, so it finishes even when the event stream is down.

#### Scenario: The stream is down
- **WHEN** the event stream is disconnected while a report is generated
- **THEN** the PDF is still downloaded once the report is Ready
