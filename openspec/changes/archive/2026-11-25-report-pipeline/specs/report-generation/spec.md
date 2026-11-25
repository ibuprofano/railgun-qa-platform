# Spec Delta

## Purpose

Defines how a project member requests a report, how it is generated in the background and stored, who can follow and download it, how long it is kept, and how downloads are recorded (PRD §8; ADR 0006, ADR 0026, ADR 0027).

## ADDED Requirements

### Requirement: A project member can request a report
Any caller with at least `Viewer` access SHALL be able to request a report of a known kind for their project, with a time zone and a range. The request SHALL create a Queued report owned by the caller and enqueue its generation in the same transaction. A caller with no role on the project SHALL get HTTP 403.

#### Scenario: Requesting the Bugs dashboard report
- **WHEN** a Viewer requests a `bugs-dashboard` report with `tz=Europe/Madrid` and range 30
- **THEN** the response is HTTP 201 with the report's id and status Queued, and one generation job is queued

#### Scenario: No access
- **WHEN** a member of another workspace requests a report for the project
- **THEN** the request is denied with HTTP 403 and nothing is created

### Requirement: Report requests are validated before anything is created
The system SHALL refuse with HTTP 400, creating nothing, a request whose kind is unknown, whose time zone is not a known time zone, or whose range is not 7, 15, 30 or 90.

#### Scenario: Unknown kind
- **WHEN** a member requests a report of kind `everything`
- **THEN** the request is refused with HTTP 400

#### Scenario: Invalid range
- **WHEN** a member requests a `bugs-dashboard` report with range 45
- **THEN** the request is refused with HTTP 400

### Requirement: A report moves from Queued to Ready or Failed
The generation job SHALL mark the report Generating, build and render it, store the file and mark it Ready with its completion time. If generation fails, it SHALL be retried, up to 3 attempts in all; after the last attempt fails, the report SHALL be marked Failed with a short reason. A run that takes more than 30 seconds SHALL count as a failed attempt.

#### Scenario: A report is generated
- **WHEN** the job for a Queued Bugs dashboard report runs
- **THEN** the report becomes Ready and its file is a PDF

#### Scenario: Every attempt fails
- **WHEN** rendering fails on all 3 attempts
- **THEN** the report is Failed with a reason, and it has no file

### Requirement: Only the requester can see or download a report
A report's status and file SHALL be readable only by the member who requested it, while they still have access to the project. Anyone else, including other members of the project, SHALL get HTTP 404, as for a report that doesn't exist.

#### Scenario: The requester checks the status
- **WHEN** the requester reads their report
- **THEN** they get its id, kind, status and, once Ready, its file name and size

#### Scenario: Another member
- **WHEN** another member of the same project reads that report or its file
- **THEN** the request is answered with HTTP 404

### Requirement: A Ready report's file is downloadable
Reading a Ready report's file SHALL return the PDF with `application/pdf`, a download file name that names the report and its date, and its length. Reading the file of a report that isn't Ready SHALL be answered with HTTP 409.

#### Scenario: Downloading
- **WHEN** the requester downloads a Ready Bugs dashboard report on 25 November 2026
- **THEN** they receive a PDF named like `bugs-dashboard-2026-11-25.pdf`

#### Scenario: Not ready yet
- **WHEN** the requester downloads a report that is still Generating
- **THEN** the request is answered with HTTP 409

### Requirement: Downloading a report is recorded in the activity log
Each download of a report's file SHALL write a `report.downloaded` activity entry in the same transaction, naming the report and the downloading member, and it SHALL appear in the project's activity feed.

#### Scenario: A download in the feed
- **WHEN** a member downloads their Bugs dashboard report
- **THEN** the project feed's All view lists that they downloaded the Bugs dashboard report

### Requirement: Reports expire after 7 days
A report SHALL expire 7 days after it was requested. An expired report SHALL no longer be readable or downloadable (HTTP 404), and the daily purge SHALL remove it with its file. Activity entries about it SHALL be kept.

#### Scenario: An expired report
- **WHEN** the requester reads a report requested 8 days ago
- **THEN** the request is answered with HTTP 404

#### Scenario: The purge
- **WHEN** the daily purge runs with one report past its expiry and one within it
- **THEN** the expired report and its file are deleted, the other is kept, and its download entries remain

### Requirement: Reports contain no secrets and no trashed items
A report's file SHALL never contain stored credentials, tokens or keys, and SHALL leave out every item in the Trash (PRD §2.11, §8).

#### Scenario: A trashed bug
- **WHEN** a bug is in the Trash when the Bugs dashboard report is generated
- **THEN** the report neither counts nor lists it
