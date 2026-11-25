# Spec Delta

## ADDED Requirements

### Requirement: The dashboard is the default right panel
With nothing selected, the right panel SHALL show the Test Cases dashboard. Selecting a folder SHALL show its summary, and selecting a test case, or opening an address that links to one, SHALL show its detail. A Dashboard toggle in the tree's toolbar SHALL clear the selection and show the dashboard, and SHALL show as pressed while it is shown.

#### Scenario: Opening the screen
- **WHEN** a member opens Test Cases with no test case or folder in the address
- **THEN** the right panel shows the dashboard and the Dashboard toggle is pressed

#### Scenario: Returning to the dashboard
- **WHEN** a member viewing a test case's detail presses the Dashboard toggle
- **THEN** the test case is deselected and the dashboard is shown

#### Scenario: A link to a test case
- **WHEN** a member opens Test Cases with `?testCase=<id>`
- **THEN** that test case's detail is shown, not the dashboard

### Requirement: The dashboard shows current data, a loading state and an empty state
Showing the dashboard SHALL always fetch current figures. While loading, it SHALL show a title placeholder and four tile placeholders. A project with no test cases SHALL show "No test cases yet" with the hint "Create test cases to start seeing metrics", and no widgets.

#### Scenario: Switching back refreshes
- **WHEN** a member changes a test case's script, then presses the Dashboard toggle
- **THEN** the dashboard is fetched again and reflects the change

#### Scenario: Empty project
- **WHEN** a member opens Test Cases in a project with no test cases
- **THEN** the dashboard shows "No test cases yet" and "Create test cases to start seeing metrics"

### Requirement: The dashboard shows four stat tiles
The dashboard SHALL show, in order: Total Tests ("N ready"), Ready as a percentage ("N of M cases"), Coverage as a percentage ("N never run"), and Avg Confidence as a percentage or "—" ("from last run results"). Each derived figure SHALL have an info tooltip explaining it.

#### Scenario: Tile values
- **WHEN** a project has 10 test cases, 6 Ready and 7 with a completed run, and no automated runs
- **THEN** the tiles read 10 ("6 ready"), 60% ("6 of 10 cases"), 70% ("3 never run") and "—"

### Requirement: The dashboard shows two trend charts and two donuts
Below the tiles, the dashboard SHALL show Test Cases Over Time (Created, Added to executions, Completed) and Pass Rate Trend side by side, each with its own range. With no completed run in the project, Pass Rate Trend SHALL be hidden and Test Cases Over Time SHALL take the full width. Below them, the Last Run Outcome and Source Type donuts.

#### Scenario: Three series
- **WHEN** on one day 2 test cases were created, 5 runs added and 3 completed
- **THEN** Test Cases Over Time shows 2, 5 and 3 for that day, and each series can be hidden from its legend

#### Scenario: No completed runs yet
- **WHEN** no run in the project has completed
- **THEN** Pass Rate Trend is not shown and Test Cases Over Time spans the full width

#### Scenario: Donuts
- **WHEN** 4 test cases last passed, 1 last failed and 5 have never run, and 8 have a script
- **THEN** Last Run Outcome shows Pass 4, Fail 1 and Never Run 5, and Source Type shows Gherkin 8 and Manual 2

### Requirement: Needs Attention lists flagged test cases in a filterable, sortable table
The table SHALL show its count, an info tooltip defining each issue, and a name filter. Each row SHALL show the test case's name with its tags, an issue badge per issue (Degrading red, the others amber), status, creation and last change time. Every column SHALL sort, defaulting to Created, oldest first. The first 10 rows SHALL show, then "Show N more". A row SHALL open the test case in a new tab.

#### Scenario: Filtering by name
- **WHEN** a member types "pay" into the Needs Attention filter
- **THEN** only rows whose test case name contains "pay" remain, ignoring case

#### Scenario: Default order and paging
- **WHEN** 14 test cases have issues
- **THEN** the 10 created earliest are shown, oldest first, followed by "Show 4 more"

#### Scenario: Sorting by Last Updated
- **WHEN** a member sorts by Last Updated
- **THEN** rows are ordered by their last change time, and sorting again reverses the order

#### Scenario: Opening a row
- **WHEN** a member opens a row for test case "Pay"
- **THEN** "Pay" opens in a new tab at Test Cases with `?testCase=<id>`

### Requirement: The dashboard shows four rankings and Folder Health
The dashboard SHALL show Most Run, Top Failing, Top Flaky and Top Tags in a 2 × 2 grid. Each row SHALL show its rank, the name and its value: completed runs; the fail rate (red at 75% or more, amber at 40% or more) and "(failed/completed)"; the flaky share in amber and "(flaky/completed)"; or the tag and its count. Test case rows SHALL open in a new tab; tag rows are not links. Each ranking SHALL have its own empty line.

#### Scenario: A failing row
- **WHEN** test case "Pay" failed 3 of 4 completed runs
- **THEN** its Top Failing row reads "75%" in red and "(3/4)"

#### Scenario: An empty ranking
- **WHEN** no run has been flaky
- **THEN** Top Flaky shows a one-line empty state instead of rows

### Requirement: Top Failing says when failing test cases are too new to rank
When failing test cases have fewer than 3 completed runs, Top Failing on the dashboard SHALL say how many, in place of its empty line when it has no rows, or below its rows otherwise. "No failing test cases — nice!" SHALL show only when no test case has failed.

#### Scenario: Failing but unranked
- **WHEN** no test case qualifies for Top Failing and 2 failing test cases have fewer than 3 completed runs
- **THEN** Top Failing reads "2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet."

#### Scenario: Ranked and unranked
- **WHEN** Top Failing lists 3 test cases and 1 more failing test case has 2 completed runs
- **THEN** below its rows it reads "1 more failing test case has fewer than 3 completed runs and isn't ranked yet."

### Requirement: Folder Health shows issue rates per folder
Below the rankings, Folder Health SHALL show one row per folder with its path joined by " / ", its direct test case count, its issue count with percentage (red at 50% or more, amber below, a green "—" with none), and one badge per issue kind with its count.

#### Scenario: A folder row
- **WHEN** "Checkout / Payments" holds 4 test cases, 2 of them Dormant
- **THEN** its row reads "Checkout / Payments", 4, "2 (50%)" in red, and "Dormant ×2"

#### Scenario: A folder without issues
- **WHEN** a folder's test cases have no issues
- **THEN** its Issues cell shows a green "—" and no badges

### Requirement: The dashboard ends with a collapsible test case History panel
The dashboard SHALL end with a History panel, collapsed by default, showing the latest 5 test case activity entries worded as on the Activity screen. Its badge SHALL show the count, or "5+" when there are more. "See full history" SHALL open the paged test case history.

#### Scenario: Expanding the panel
- **WHEN** a member expands History in a project with 12 test case entries
- **THEN** the latest 5 are shown, newest first, and the badge reads "5+"

#### Scenario: Full history
- **WHEN** the member presses "See full history"
- **THEN** a dialog lists the project's test case entries, loading older ones on demand

### Requirement: The test case detail shows health banners
The test case detail SHALL show one banner per health flag the test case has: Orphan, Never Run, Dormant (with the days since its last completed run), Degrading and Improving (with both 5-run pass rates), and Trend Reset. A test case with none of these SHALL show no banner.

#### Scenario: A degrading test case
- **WHEN** a member opens a test case whose last 5 runs passed 40% against 80% for the 5 before
- **THEN** a Degrading banner reads that its pass rate fell from 80% to 40% over its last 5 runs

#### Scenario: An orphan
- **WHEN** a member opens a test case never added to an execution
- **THEN** an Orphan banner says it has never been added to any execution

#### Scenario: A healthy test case
- **WHEN** a member opens a test case run yesterday with a stable pass rate
- **THEN** no health banner is shown
