# Spec Delta

## MODIFIED Requirements

### Requirement: A project member can request a report
Any caller with at least `Viewer` access SHALL be able to request a report of a known kind for their project, with that kind's options: `bugs-dashboard` takes a time zone and a range; `executions-dashboard` takes a time zone, the list filters, the runs-table state, both chart ranges and the two export switches. The request SHALL create a Queued report owned by the caller and enqueue its generation in the same transaction. A caller with no role on the project SHALL get HTTP 403.

#### Scenario: Requesting the Bugs dashboard report
- **WHEN** a Viewer requests a `bugs-dashboard` report with `tz=Europe/Madrid` and range 30
- **THEN** the response is HTTP 201 with the report's id and status Queued, and one generation job is queued

#### Scenario: Requesting the Executions dashboard report
- **WHEN** a Viewer requests an `executions-dashboard` report with a status filter of Done, the All Runs tab, ranges 30 and 7, and both switches on
- **THEN** the response is HTTP 201 with status Queued, and the report keeps those options

#### Scenario: No access
- **WHEN** a member of another workspace requests a report for the project
- **THEN** the request is denied with HTTP 403 and nothing is created

### Requirement: Report requests are validated before anything is created
The system SHALL refuse with HTTP 400, creating nothing, a request whose kind is unknown, whose time zone is not a known time zone, or whose options don't fit its kind: a range other than 7, 15, 30 or 90; an unknown status, browser, outcome, tab or sort column; a tag id that isn't an id; a malformed day; or, for the Executions dashboard report, both switches off.

#### Scenario: Unknown kind
- **WHEN** a member requests a report of kind `everything`
- **THEN** the request is refused with HTTP 400

#### Scenario: Invalid range
- **WHEN** a member requests a `bugs-dashboard` report with range 45
- **THEN** the request is refused with HTTP 400

#### Scenario: Nothing to include
- **WHEN** a member requests an `executions-dashboard` report with both switches off
- **THEN** the request is refused with HTTP 400 and nothing is created

#### Scenario: An unknown status filter
- **WHEN** a member requests an `executions-dashboard` report filtered by status `Archived`
- **THEN** the request is refused with HTTP 400

## ADDED Requirements

### Requirement: A download entry names its report
A `report.downloaded` entry SHALL name the kind of report downloaded ("Bugs dashboard report", "Executions dashboard report"), so the Activity screen says which report it was.

#### Scenario: An Executions report download
- **WHEN** a member downloads their Executions dashboard report
- **THEN** the project feed lists that they downloaded the Executions dashboard report
