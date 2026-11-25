# executions-dashboard-report Specification

## Purpose

Defines the Executions dashboard PDF (PRD §8, §6.3.6): what it shows, how the export dialog's switches and the dashboard's filters shape it, and that its figures match the dashboard for the same scope, time zone and ranges.

## Requirements

### Requirement: The Executions dashboard report shows the dashboard's figures for its scope
The Executions dashboard report SHALL show, in this order: a title with the project's name and the generation date; the active filters, named; the four stat tiles; Executions Over Time and Runs Over Time, each for the range selected on screen; and the Execution Status and Run Outcomes donuts with their legends. Every figure SHALL cover the executions the list filters select, as the dashboard does.

#### Scenario: Filtered by environment
- **WHEN** the list is filtered to environment Staging and a member downloads the report
- **THEN** the report names "Environment: Staging", and its tiles, charts and donuts count only Staging's executions and their runs

#### Scenario: Each chart its own range
- **WHEN** Executions Over Time is set to 30 days and Runs Over Time to 7
- **THEN** the report's charts cover 30 and 7 days respectively

### Requirement: The switches choose the report's tables
With Test Executions on, the report SHALL list the executions in scope with their name, status, environment, browser and completion day. With the Runs switch on, it SHALL list the runs the runs table shows: its tab, outcome, day and name filters, in its sort order, with each run's execution, test case, outcome, attempts and bugs, and the runs filter named. A switch that is off SHALL leave its table out.

#### Scenario: Needs Attention runs only
- **WHEN** a member opens the dialog on the Needs Attention tab, turns Test Executions off and Runs on, and downloads
- **THEN** the report lists only Needs Review runs and no executions table

#### Scenario: A day filter
- **WHEN** the runs table is filtered to 4 March · Failed and sorted by bugs
- **THEN** the runs table in the report holds only that day's failed runs, most bugs first, and names "4 Mar · Failed"

### Requirement: The Executions report's figures match the dashboard
Every number in the Executions dashboard report SHALL equal what the dashboard shows for the same project, filters, time zone and ranges at the moment it is generated, using the execution-metrics definitions. Items in the Trash SHALL be left out.

#### Scenario: Same numbers as the screen
- **WHEN** the dashboard shows Executions 3 "1 active" and Total Runs 12 "8 completed" for the current scope, and a member downloads the report
- **THEN** the report's tiles read 3 "1 active" and 12 "8 completed"
