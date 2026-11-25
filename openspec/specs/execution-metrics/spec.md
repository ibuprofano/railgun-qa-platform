# execution-metrics Specification

## Purpose

Defines the Executions dashboard's data (PRD §6.3.6): which executions and runs it reads, how each is described and dated, who can read it, and the shared rules that turn a scope of executions into its tiles, daily series and splits.

## Requirements

### Requirement: The Executions dashboard is readable by every project member
The system SHALL return a project's Executions dashboard data to any caller with at least `Viewer` access, in one read whose rows are consistent with each other. A caller with no role on the project SHALL get HTTP 403. The `dashboard` path SHALL never be read as an execution id.

#### Scenario: A Viewer reads the dashboard
- **WHEN** a Viewer reads their project's Executions dashboard
- **THEN** the response holds the execution rows, the run rows and today's date in the requested time zone

#### Scenario: No access
- **WHEN** a member of another workspace reads the project's Executions dashboard
- **THEN** the request is denied with HTTP 403

#### Scenario: Not an execution id
- **WHEN** a member requests `/projects/<id>/executions/dashboard`
- **THEN** the dashboard is returned, not a "not found" for an execution named `dashboard`

### Requirement: The dashboard reads live executions and current runs
The read SHALL include every execution not in the Trash, and every run of those executions by its current outcome, including runs whose test case is in the Trash (PRD §2.11). Executions in the Trash and their runs SHALL not appear. Outcomes from earlier attempts SHALL not appear as runs.

#### Scenario: A trashed execution
- **WHEN** an execution with three runs is in the Trash
- **THEN** neither it nor its runs appear in the read

#### Scenario: A run of a trashed test case
- **WHEN** a run's test case is in the Trash and its execution is not
- **THEN** the run appears, named as it was recorded

#### Scenario: A restarted execution
- **WHEN** an execution's run was Fail in attempt 1 and is Pending after a Restart
- **THEN** the run appears once, as Pending

### Requirement: Each execution row carries its list fields and completion day
Each execution row SHALL carry the execution's id, name, status, environment name, browser and the ids of tags its test cases currently carry, so the same filters as the execution list can scope it. It SHALL carry the calendar day, in the requested time zone, on which the execution completed, or none when it has not completed.

#### Scenario: A completed execution
- **WHEN** an execution reached Completed at 23:30 UTC on 3 March and the requested zone is `Europe/Madrid`
- **THEN** its row reports 4 March as its completion day

#### Scenario: A canceled execution
- **WHEN** an execution was canceled without reaching Completed
- **THEN** its row reports no completion day

#### Scenario: A restarted execution
- **WHEN** a Completed execution is restarted and is now Ready
- **THEN** its row reports no completion day

### Requirement: Each run row describes the run as the runs table shows it
Each run row SHALL carry: its execution's id and name; its position; its test case id and name (as recorded at start, else the current name); its current outcome; the day its outcome was recorded in the requested zone, for completed runs; its attempt count; its bug count; its failed step; its created and last-updated times.

#### Scenario: A failed run with a bug
- **WHEN** a run failed in its execution's second attempt, and a bug filed from it in that attempt names the failed step "Then the total is $10"
- **THEN** its row reports outcome Fail, 2 attempts, 1 bug and that failed step

#### Scenario: A bug from an earlier attempt
- **WHEN** the only bug naming a failed step was filed from the run's first attempt, and the run is now in its second
- **THEN** the row counts the bug but reports no failed step

#### Scenario: A pending run
- **WHEN** a run is Pending
- **THEN** its row reports no completion day and no last-updated time

### Requirement: Attempts and bugs are counted per run
A run's attempt count SHALL be the number of attempts the run has had: its earlier attempts kept as history, plus the current one. Its bug count SHALL be the number of bugs not in the Trash linked to the run, from any attempt.

#### Scenario: Never restarted
- **WHEN** a run's execution has never been restarted
- **THEN** its attempt count is 1

#### Scenario: A trashed bug
- **WHEN** one of a run's two linked bugs is in the Trash
- **THEN** its bug count is 1

### Requirement: Dashboard figures follow the scope of executions
Given a scope of executions, the dashboard SHALL compute: Executions (count, and how many are In Progress or Paused); Total Runs (their runs, and how many are completed); Pass Rate (Pass over completed runs, as "X of Y runs", or no data); Avg Duration ("—" while no run has a duration).

#### Scenario: Figures for a scope
- **WHEN** the scope holds two executions, one In Progress, with 10 runs of which 6 are completed and 3 passed
- **THEN** Executions is 2 with "1 active", Total Runs is 10 with "6 completed", and Pass Rate is 50% with "3 of 6 runs"

#### Scenario: No completed runs
- **WHEN** no run in the scope is completed
- **THEN** Pass Rate is "—" with "no results yet"

#### Scenario: Manual runs only
- **WHEN** every run in the scope is manual
- **THEN** Avg Duration is "—"

### Requirement: Daily series and splits follow the scope
For the scope, the dashboard SHALL give 90 calendar days ending today in the viewer's zone: executions completed per day, and completed runs per day by outcome (Passed, Failed, Needs Review). A day with none SHALL count 0. It SHALL split executions by status and runs by current outcome (Pass, Fail, Needs Review, Pending).

#### Scenario: Runs on one day
- **WHEN** on 4 March the scope's runs recorded 3 Pass, 1 Fail and no Needs Review outcomes
- **THEN** the 4 March bar holds Passed 3, Failed 1 and Needs Review 0

#### Scenario: Narrowing the scope
- **WHEN** the scope is narrowed to executions in the Staging environment
- **THEN** every tile, series and split counts only those executions and their runs
