# Spec Delta

## Purpose

Defines the Test Cases dashboard PDF (PRD §8, §6.2.4): what it shows, how the dashboard's chart ranges and Needs Attention filter and sort shape it, and that its figures match the dashboard for the same time zone.

## ADDED Requirements

### Requirement: The Test Cases report shows the dashboard's tiles, charts and donuts
The Test Cases dashboard report SHALL start with a title naming the project and the generation date, then show the four stat tiles, Test Cases Over Time and Pass Rate Trend, each for the range selected on screen, and the Last Run Outcome and Source Type donuts with their legends. When no run in the project has completed, it SHALL leave out Pass Rate Trend, as the dashboard does.

#### Scenario: Each chart its own range
- **WHEN** Test Cases Over Time is set to 30 days and Pass Rate Trend to 7, and a member downloads the report
- **THEN** the report's Test Cases Over Time covers 30 days and its Pass Rate Trend covers 7

#### Scenario: No completed runs
- **WHEN** no run in the project has completed and a member downloads the report
- **THEN** the report shows Test Cases Over Time and no Pass Rate Trend

#### Scenario: Avg Confidence without automated runs
- **WHEN** the project has no automated runs
- **THEN** the report's Avg Confidence tile reads "—"

### Requirement: The Test Cases report lists Needs Attention as the screen filters and sorts it
The report SHALL list every Needs Attention row that matches the name filter on screen, not only the first 10, in the table's sort order. Each row SHALL show the test case's name with its tag names, its issues, status, creation day and last change day, in the requester's time zone. When a name filter is set, the report SHALL name it.

#### Scenario: Filtered and sorted
- **WHEN** 14 test cases have issues, the member filters Needs Attention by "pay", which matches 3 of them, sorts by Last Updated, newest first, and downloads the report
- **THEN** the report lists those 3 rows, most recently changed first, and names the filter "pay"

#### Scenario: More than one page on screen
- **WHEN** 14 test cases have issues and no filter is set
- **THEN** the report lists all 14, created earliest first

### Requirement: The Test Cases report shows the rankings and Folder Health
After Needs Attention, the report SHALL show Most Run, Top Failing, Top Flaky and Top Tags, each with its rank, name and value as on the dashboard and its own empty line, then Folder Health with each folder's path, test case count, issue count and percentage, and the count of each issue kind. Top Failing SHALL say how many failing test cases are too new to rank, as the dashboard does.

#### Scenario: A failing row
- **WHEN** test case "Pay" failed 3 of 4 completed runs
- **THEN** its Top Failing row in the report reads "75%" and "(3/4)"

#### Scenario: Failing but unranked
- **WHEN** no test case qualifies for Top Failing and 2 failing test cases have fewer than 3 completed runs
- **THEN** the report's Top Failing reads "2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet."

### Requirement: The Test Cases report's figures match the dashboard
Every number in the Test Cases dashboard report SHALL equal what the dashboard shows for the same project and time zone at the moment it is generated, using the test-case-metrics and test-case-health definitions. Test cases and executions in the Trash SHALL be left out as the dashboard leaves them out.

#### Scenario: Same numbers as the screen
- **WHEN** the dashboard shows Total Tests 10 ("6 ready") and Coverage 70% ("3 never run"), and a member downloads the report
- **THEN** the report's tiles read 10 ("6 ready") and 70% ("3 never run")

#### Scenario: A trashed test case
- **WHEN** a test case with an issue is in the Trash when the report is generated
- **THEN** the report neither counts it in the tiles nor lists it in Needs Attention
