# Spec Delta

## ADDED Requirements

### Requirement: The Test Cases dashboard has a header with Download report
The dashboard SHALL start with the heading "Dashboard" and a **Download report** button. Pressing it SHALL request the Test Cases dashboard report with the viewer's time zone, the range selected on each trend chart, and the Needs Attention name filter and sort as shown. The button SHALL be available to every member who can see the dashboard.

#### Scenario: Before report generation
- **WHEN** a Viewer opens the dashboard of a project with test cases and has not requested a report
- **THEN** Download report is shown and enabled

#### Scenario: Requesting the report
- **WHEN** a member sets Test Cases Over Time to 30 days and Pass Rate Trend to 7, filters Needs Attention by "pay", sorts it by Last Updated twice, and presses Download report
- **THEN** a Test Cases dashboard report is requested with the browser's time zone, ranges 30 and 7, the filter "pay" and a sort by Last Updated, descending

#### Scenario: Pass Rate Trend hidden
- **WHEN** no run in the project has completed and a member presses Download report
- **THEN** the report is requested with Pass Rate Trend's default range

### Requirement: Download report on the Test Cases dashboard shows progress and downloads when ready
While the requested report is Queued or Generating, the button SHALL read "Generating…" and be disabled. When the report becomes Ready, the browser SHALL download the PDF and the button SHALL return to Download report. If the report fails, or the request is refused, the dashboard SHALL say "The report couldn't be generated." with a Try again button that requests it again.

#### Scenario: Generating, then downloaded
- **WHEN** a member presses Download report and the report becomes Ready
- **THEN** the button reads "Generating…" until then, the PDF is downloaded, and the button reads Download report again

#### Scenario: The report fails
- **WHEN** the requested report ends Failed
- **THEN** the dashboard shows "The report couldn't be generated." and Try again requests a new report

### Requirement: The Test Cases dashboard learns of a finished report without a reload
The dashboard SHALL notice that the report has finished from the project's live events, and SHALL also check the report's status every few seconds while it is generating, so it finishes even when the event stream is down.

#### Scenario: The stream is down
- **WHEN** the event stream is disconnected while a report is generated
- **THEN** the PDF is still downloaded once the report is Ready
