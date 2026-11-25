# Spec Delta

## MODIFIED Requirements

### Requirement: Events carry identifiers only and reach only their project
Each event SHALL contain only its type and identifiers: project, execution and, where relevant, run, or, for a report event, the report. It SHALL NOT contain names, outcomes, statuses or any other content. An event SHALL be delivered only to streams open on the project it belongs to, never to another project or workspace.

#### Scenario: Another workspace's stream
- **WHEN** an execution changes in workspace A's project
- **THEN** a stream open on workspace B's project receives nothing

#### Scenario: Another project in the same workspace
- **WHEN** an execution changes in project P1
- **THEN** a stream open on project P2 of the same workspace receives nothing

## ADDED Requirements

### Requirement: A report's status changes emit an event
The system SHALL emit a `report.changed` event carrying the report's id whenever a report's generation starts, finishes or fails, only after that change commits. The event SHALL carry no status, name or file content.

#### Scenario: A report becomes Ready
- **WHEN** a report's generation finishes while its requester has the project's stream open
- **THEN** that stream receives a `report.changed` event with the report's id and nothing else but the project's id
