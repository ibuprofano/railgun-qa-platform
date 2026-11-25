# test-case-metrics Specification

## Purpose

Defines the Test Cases dashboard's figures (PRD §6.2.4): stat tiles, daily series, outcome and source splits, Needs Attention, rankings and Folder Health, which items they count, and who can read them.

## Requirements

### Requirement: The Test Cases dashboard is readable by every project member
The system SHALL return a project's Test Cases dashboard to any caller with at least `Viewer` access, in one read whose figures are consistent with each other. A caller with no role on the project SHALL get HTTP 403.

#### Scenario: A Viewer reads the dashboard
- **WHEN** a Viewer reads their project's Test Cases dashboard
- **THEN** the response holds the tiles, daily series, splits, Needs Attention rows, rankings and Folder Health rows

#### Scenario: No access
- **WHEN** a member of another workspace reads the project's dashboard
- **THEN** the request is denied with HTTP 403

### Requirement: Test case figures count live test cases and current outcomes
The tiles, splits, Needs Attention, rankings and Folder Health SHALL count only test cases not in the Trash, and only runs of executions not in the Trash, by their current outcome. Outcomes from earlier attempts SHALL not count, except to decide whether a run is flaky.

#### Scenario: A trashed test case
- **WHEN** a test case with failed runs is in the Trash
- **THEN** it appears in no tile, split, ranking or table

#### Scenario: A trashed execution
- **WHEN** a test case's only completed run belongs to an execution in the Trash
- **THEN** it counts as never run

### Requirement: The tiles report totals, readiness, coverage and confidence
The tiles SHALL report the number of test cases, how many are Ready, how many have at least one completed run, and the mean AI confidence of each test case's latest completed automated run. With no automated runs, the confidence SHALL be "no data". Total, Ready share and coverage SHALL equal the Overview's.

#### Scenario: Tile figures
- **WHEN** a project has 10 test cases, 6 Ready, and 7 with a completed run, all manual
- **THEN** the tiles report 10 in total, 6 Ready, 7 covered with 3 never run, and no confidence

#### Scenario: Matching the Overview
- **WHEN** a member reads both the Overview and the Test Cases dashboard
- **THEN** both report the same total, Ready percentage and coverage

### Requirement: Daily series cover 90 days in the viewer's time zone
The dashboard SHALL return, for each of the 90 calendar days ending today in an IANA time zone the caller names: test cases created, runs added to executions, runs completed, and runs passed. Run counts SHALL cover every run of executions not in the Trash. An unknown zone SHALL be rejected with HTTP 400.

#### Scenario: One day's counts
- **WHEN** on 10 November 2 test cases were created, 5 runs were added to an execution and 3 runs completed, 2 of them Pass
- **THEN** the 10 November entry reports 2 created, 5 added, 3 completed and 2 passed

#### Scenario: A run near midnight
- **WHEN** a run's outcome was recorded at 23:30 UTC on 10 November and the caller names `Europe/Madrid`
- **THEN** it counts as completed on 11 November

#### Scenario: Unknown zone
- **WHEN** a caller names `Mars/Olympus`
- **THEN** the request is rejected with HTTP 400

#### Scenario: Whether any run has completed
- **WHEN** a project has no completed run in a live execution
- **THEN** the dashboard says so, so the screen can hide the Pass Rate Trend

### Requirement: The splits count test cases by last outcome and source type
The Last Run Outcome split SHALL count test cases by the current outcome of their latest completed run: Pass, Fail, Needs Review, or Never Run for those with none. The Source Type split SHALL count Gherkin test cases (with a non-empty script) and Manual ones.

#### Scenario: Last outcomes
- **WHEN** a test case's latest completed run failed, an older one passed, and another test case has only a Pending run
- **THEN** the first counts under Fail and the second under Never Run

#### Scenario: Source types
- **WHEN** 8 test cases have a script and 2 have none
- **THEN** the split reports 8 Gherkin and 2 Manual

### Requirement: Needs Attention lists every test case with an issue
The dashboard SHALL list every test case flagged No Script, Orphan, Never Run, Dormant or Degrading by the health rules, with its issues, name, tags, status, creation time and last change time. Improving and Trend Reset SHALL not count as issues.

#### Scenario: Two issues on one test case
- **WHEN** a test case has no script and was never added to an execution
- **THEN** it is listed once, with No Script and Orphan

#### Scenario: Healthy test cases
- **WHEN** a test case has a script and a run completed yesterday, and is not Degrading
- **THEN** it is not listed

#### Scenario: Same rules as the detail
- **WHEN** a test case's detail reports Dormant
- **THEN** its Needs Attention row lists Dormant

### Requirement: Rankings list the top 10 test cases and tags
The dashboard SHALL return four rankings of at most 10 rows each: Most Run (completed runs, most first); Top Failing (at least 3 completed runs and a Fail, by fail rate, then failures); Top Flaky (at least one flaky run, by flaky runs ÷ completed runs, then flaky runs); and Top Tags (tags carried by at least one test case, by test case count). Remaining ties SHALL be ordered by name.

#### Scenario: Top Failing
- **WHEN** test case A failed 3 of 4 completed runs, B failed 1 of 2, and C failed 2 of 10
- **THEN** Top Failing lists A (75%) then C (20%), and not B

#### Scenario: A flaky run
- **WHEN** a run's current outcome is Pass and an earlier attempt of the same run recorded Fail
- **THEN** its test case appears in Top Flaky with 1 flaky run out of its completed runs

#### Scenario: Top Tags
- **WHEN** "smoke" is on 5 live test cases, "checkout" on 2 and "legacy" on none
- **THEN** Top Tags lists "smoke" (5) then "checkout" (2), and not "legacy"

### Requirement: Folder Health summarizes issues per folder
The dashboard SHALL return one row per folder that directly holds live test cases: its full path, its number of direct test cases, how many of them have at least one issue and that share, and a count per issue kind. Rows SHALL be ordered by issue share, highest first, then by path. Test cases at the root SHALL not form a row.

#### Scenario: A folder's row
- **WHEN** folder "Checkout / Payments" directly holds 4 test cases, of which 2 are Dormant and one of those also has no script
- **THEN** its row reports 4 cases, 2 with issues (50%), Dormant ×2 and No Script ×1

#### Scenario: Ordering
- **WHEN** "Login" has 1 of 4 test cases with an issue and "Cart" has 3 of 4
- **THEN** "Cart" comes before "Login"

### Requirement: Top Failing reports the failing test cases it leaves out
Alongside Top Failing, the dashboard SHALL report how many live test cases have at least one Fail but fewer than 3 completed runs, and so are not ranked.

#### Scenario: Failing but too few runs
- **WHEN** test case A failed 3 of 4 completed runs, and B and D each failed their only 1 or 2 completed runs
- **THEN** Top Failing lists A, and the dashboard reports 2 failing test cases below the minimum
