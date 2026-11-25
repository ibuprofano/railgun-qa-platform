# Spec Delta

## Purpose

The project's health figures as the dashboards show them (PRD §6.1, §6.12): one set of metric definitions, starting with the Overview's KPIs, Health Score and rankings.

## ADDED Requirements

### Requirement: The Overview stats are readable by every project member
The system SHALL return a project's Overview figures in one read, to any caller with at least `Viewer` access. A caller with no access to the project SHALL get HTTP 403.

#### Scenario: A Viewer reads the Overview
- **WHEN** a Viewer reads the Overview stats of their project
- **THEN** the response holds every KPI value, the Health Score, Top Failing Tests and Urgent Bugs

#### Scenario: No access
- **WHEN** a caller with no role on the project, including a member of another workspace, reads its Overview stats
- **THEN** the request is denied with HTTP 403

### Requirement: Only live items and current outcomes are counted
Every Overview figure SHALL count only items that are not in the Trash, and runs whose execution is not in the Trash. A run SHALL count by its current outcome only. Outcomes kept as an execution's attempt history SHALL never be counted. A completed run is one whose outcome is Pass, Fail or Needs Review, completed at the moment that outcome was recorded.

#### Scenario: A deleted execution's runs
- **WHEN** a Draft execution with completed runs is deleted
- **THEN** its runs no longer count toward any figure, and they count again once it is restored

#### Scenario: A restarted execution
- **WHEN** an execution whose run failed is restarted and the run then passes
- **THEN** only the Pass counts, and the earlier Fail is ignored

#### Scenario: A trashed bug
- **WHEN** an open Critical bug is deleted
- **THEN** it no longer counts in Open Bugs, Critical Bugs, the Health Score or Urgent Bugs

### Requirement: The test case KPIs count live test cases
The Overview SHALL report Total Test Cases, the percentage of them that are Ready, and Coverage: the percentage of test cases with at least one completed run. Percentages SHALL be whole numbers, rounded half up, and 0 when their denominator is 0.

#### Scenario: Coverage and Ready share
- **WHEN** a project has 4 test cases, 1 of them Ready, and 3 with a completed run
- **THEN** Total Test Cases is 4, the Ready share is 25 and Coverage is 75

#### Scenario: No test cases
- **WHEN** a project has no test cases
- **THEN** Total Test Cases, the Ready share and Coverage are all 0

### Requirement: Pass Rate covers the last 30 days and counts Needs Review
The Overview SHALL report the Pass Rate as Pass ÷ (Pass + Fail + Needs Review) over the runs completed in the last 30 days, as a whole percentage rounded half up. With no runs completed in that window it SHALL report none, not 0.

#### Scenario: Pass rate counts Needs Review
- **WHEN** the last 30 days hold 6 Pass, 2 Fail and 2 Needs Review runs, and a Pass from 40 days ago
- **THEN** the pass rate is 60

#### Scenario: No recent runs
- **WHEN** the project's only completed runs are older than 30 days
- **THEN** the pass rate is reported as none, not 0

### Requirement: The run and bug KPIs count current state
The Overview SHALL report Active Runs (executions In Progress), Open Bugs (bugs Open or In Progress) and Critical Bugs (open bugs of Critical severity).

#### Scenario: Bug and execution counts
- **WHEN** a project has an Open Critical, an In Progress High and a Resolved Critical bug, and an execution In Progress and one Paused
- **THEN** Open Bugs is 2, Critical Bugs is 1 and Active Runs is 1

### Requirement: The Health Score combines four weighted components
The Health Score SHALL be 0.40 × pass rate + 0.20 × coverage + 0.25 × bug pressure + 0.15 × freshness, rounded half up. Pass rate is the Pass Rate KPI, or 0 when there is none. Coverage is the Coverage KPI. Bug pressure is 100 minus 25 per open Critical, 10 per open High and 3 per open Medium bug, never below 0. Freshness is the percentage of Ready test cases with a run completed in the last 14 days, or 0 with none Ready.

#### Scenario: A healthy project
- **WHEN** pass rate is 90, coverage 80, there is one open Medium bug, and 3 of 4 Ready test cases ran in the last 14 days
- **THEN** the components are 90, 80, 97 and 75, and the score is 88

#### Scenario: Bug pressure has a floor
- **WHEN** a project has 5 open Critical bugs
- **THEN** bug pressure is 0, not negative

#### Scenario: No runs in the last 30 days
- **WHEN** a project's completed runs are all older than 30 days
- **THEN** the pass-rate component is 0 and a score is still reported

### Requirement: The Health Score reports its band and components
The response SHALL include the four components and the band: Healthy from 80 to 100, At Risk from 60 to 79, Critical below 60. A project with no completed runs at all SHALL get no score and no band, while its other KPIs are still reported.

#### Scenario: Bands
- **WHEN** the score is 80, 79 or 59
- **THEN** the band is Healthy, At Risk or Critical respectively

#### Scenario: No runs at all
- **WHEN** a project has test cases and bugs but no completed run
- **THEN** no score and no band are reported, and the other KPIs are

### Requirement: Top Failing Tests ranks test cases by fail rate
The Overview SHALL list up to 6 test cases with at least 3 completed runs and at least one Fail. Each SHALL be listed with its failures, completed runs and fail rate: Fail ÷ (Pass + Fail + Needs Review) over all its completed runs, as a whole percentage. The list SHALL be ordered by fail rate, highest first, then by failures, then by name.

#### Scenario: Ranking and thresholds
- **WHEN** test case A failed 3 of 4 runs, B failed 1 of 2 runs, C failed 2 of 8 runs, and D passed all 5
- **THEN** the list is A (75%, 3 of 4), then C (25%, 2 of 8). B has too few runs and D never failed.

#### Scenario: At most six
- **WHEN** 9 test cases qualify
- **THEN** only the 6 highest are listed

#### Scenario: A trashed test case
- **WHEN** a qualifying test case is deleted
- **THEN** it is no longer listed

### Requirement: Urgent Bugs lists open Critical and High bugs
The Overview SHALL list up to 6 open bugs of Critical or High severity, Critical first, then the most recently reported. Each SHALL carry its id, title, severity, status and when it was reported.

#### Scenario: Order and filter
- **WHEN** a project has an open High bug from today, an open Critical bug from last week, a Resolved Critical bug and an open Medium bug
- **THEN** the list is the Critical bug, then the High bug
