# test-case-health Specification

## Purpose

Defines the health rules for one test case (No Script, Orphan, Never Run, Dormant, Degrading, Improving, Trend Reset), the runs they count, and how the test case detail reports them. The detail's banners and the Test Cases dashboard both rely on these rules (ADR 0025).

## Requirements

### Requirement: Health rules count a test case's live runs and current outcomes
The health rules SHALL count only the test case's runs in executions not in the Trash. A run is completed when its current outcome is Pass, Fail or Needs Review, and its completion time is when that outcome was recorded. Outcomes kept from earlier attempts SHALL not count. "Now" is the database clock.

#### Scenario: A run of a trashed execution
- **WHEN** a test case's only run belongs to an execution in the Trash
- **THEN** the rules treat the test case as never added to an execution

#### Scenario: An earlier attempt's outcome
- **WHEN** a run failed in attempt 1 and is Pending after a Restart
- **THEN** the rules count the run as added but not completed

### Requirement: No Script flags a test case without a Gherkin script
A test case with no Gherkin script, or an empty one, SHALL be flagged No Script.

#### Scenario: A manual test case
- **WHEN** a test case has no Gherkin script
- **THEN** it is flagged No Script

### Requirement: Orphan and Never Run flag test cases without completed runs
A test case with no run SHALL be flagged Orphan. A test case with at least one run but no completed run SHALL be flagged Never Run. A test case is never both.

#### Scenario: Never added
- **WHEN** a test case was never added to an execution
- **THEN** it is flagged Orphan and not Never Run

#### Scenario: Added but not run
- **WHEN** a test case's only run is Pending in a Draft execution
- **THEN** it is flagged Never Run and not Orphan

### Requirement: Dormant flags a test case whose last completed run is old
A test case with at least one completed run SHALL be flagged Dormant when its latest completion time is more than 14 days ago.

#### Scenario: Last run 15 days ago
- **WHEN** a test case's latest completed run was recorded 15 days ago
- **THEN** it is flagged Dormant

#### Scenario: Last run 10 days ago
- **WHEN** a test case's latest completed run was recorded 10 days ago
- **THEN** it is not flagged Dormant

### Requirement: Degrading and Improving compare the last two 5-run windows
With at least 10 completed runs counted, newest first by completion time, the pass rate of the latest 5 SHALL be compared with that of the 5 before them. 20 or more points lower SHALL flag Degrading; 20 or more points higher SHALL flag Improving. After a script edit, only runs completed after the edit SHALL count.

#### Scenario: Degrading
- **WHEN** a test case's latest 5 completed runs have 2 passes and the 5 before them have 4
- **THEN** it is flagged Degrading, with pass rates of 40% and 80%

#### Scenario: Improving
- **WHEN** its latest 5 have 5 passes and the 5 before them have 3
- **THEN** it is flagged Improving

#### Scenario: Not enough runs
- **WHEN** a test case has 9 completed runs
- **THEN** it is flagged neither Degrading nor Improving

#### Scenario: A smaller change
- **WHEN** its latest 5 have 3 passes and the 5 before them have 3
- **THEN** it is flagged neither Degrading nor Improving

### Requirement: Trend Reset follows a script edit until 10 new runs complete
A test case SHALL be flagged Trend Reset when its script was edited after creation, it has a completed run from before the last edit, and fewer than 10 runs have completed since that edit. While flagged Trend Reset, it SHALL be flagged neither Degrading nor Improving.

#### Scenario: Edited after 12 runs
- **WHEN** a test case had 12 completed runs, its script was edited, and 3 runs have completed since
- **THEN** it is flagged Trend Reset, and not Degrading even if its older runs would say so

#### Scenario: Enough new runs
- **WHEN** 10 runs have completed since the edit
- **THEN** it is no longer flagged Trend Reset, and Degrading and Improving use only those 10 runs

#### Scenario: Edited before any run
- **WHEN** a test case's script was edited before it ever completed a run
- **THEN** it is not flagged Trend Reset

### Requirement: The test case detail reports its health
A test case's detail SHALL report its health flags. When Degrading or Improving was evaluated, it SHALL also report the two 5-run pass rates. Every write that returns the test case SHALL report its health as of that write.

#### Scenario: Reading a dormant test case
- **WHEN** a Viewer reads a test case whose last completed run was 20 days ago
- **THEN** the detail reports the Dormant flag

#### Scenario: Health after an edit
- **WHEN** a Contributor clears a test case's Gherkin script
- **THEN** the update's response reports the No Script flag
