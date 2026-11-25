# Spec Delta

## MODIFIED Requirements

### Requirement: The execution list can be sorted and filtered
The Executions screen SHALL let the user sort the list by last updated, creation date, or status, ascending or descending, and filter it by name text, status, environment, browser, and tags. With tags picked, an execution SHALL be listed when at least one of its test cases currently carries any of them (PRD §6.3.2). The default is last updated, newest first.

#### Scenario: Sorting by creation date
- **WHEN** the user sorts by creation date ascending
- **THEN** the oldest execution is listed first

#### Scenario: Filtering by status and name
- **WHEN** the user filters by status `InProgress` and name text "smoke"
- **THEN** only In Progress executions whose name contains "smoke" (case-insensitive) are listed

#### Scenario: Filtering by tags
- **WHEN** the user picks the tag "payments", which one test case of execution "Payments smoke" carries and no test case of "Release regression" does
- **THEN** "Payments smoke" is listed and "Release regression" is not

#### Scenario: Filtering by Canceled
- **WHEN** the user filters by status Canceled
- **THEN** only Canceled executions are listed

## ADDED Requirements

### Requirement: The dashboard is the default right panel
With no execution in the address, the right panel SHALL show the Executions dashboard. Selecting an execution, or opening an address that links to one, SHALL show its detail. A Dashboard toggle in the list's header SHALL clear the selection and show the dashboard, and SHALL show as pressed while it is shown.

#### Scenario: Opening the screen
- **WHEN** a member opens Executions with no execution in the address
- **THEN** the right panel shows the dashboard and the Dashboard toggle is pressed

#### Scenario: A link to an execution
- **WHEN** a member opens Executions with `?execution=<id>`
- **THEN** that execution's detail is shown, not the dashboard

#### Scenario: Returning to the dashboard
- **WHEN** a member viewing an execution presses the Dashboard toggle
- **THEN** the execution is deselected and the dashboard is shown

### Requirement: A run can be opened from the address
Opening Executions with `?execution=<id>&run=<runId>` SHALL show that execution's detail with that run's panel open. Closing the panel SHALL remove the run from the address. An unknown run id SHALL leave the panel closed.

#### Scenario: Opening a run link
- **WHEN** a member opens `?execution=<id>&run=<runId>` for a run of that execution
- **THEN** the execution's detail is shown with that run's panel open

#### Scenario: A run of another execution
- **WHEN** the run id belongs to no run of the named execution
- **THEN** the detail is shown with no run panel open

### Requirement: The dashboard shows current data, a loading state and an empty state
Showing the dashboard SHALL always fetch current data. While loading, it SHALL show tile and chart placeholders, with the History panel already shown below them. A project with no executions SHALL show "No executions yet" with the hint "Create an execution to start seeing metrics", and no widgets or download button.

#### Scenario: Switching back refreshes
- **WHEN** a member records an outcome in an execution, then presses the Dashboard toggle
- **THEN** the dashboard is fetched again and reflects the outcome

#### Scenario: Empty project
- **WHEN** a member opens Executions in a project with no executions
- **THEN** the dashboard shows "No executions yet" and "Create an execution to start seeing metrics", with no download button

### Requirement: The dashboard's scope follows the list filters
The dashboard SHALL cover exactly the executions the list currently shows. While any list filter is on, a notice above the tiles SHALL name each active filter. Clearing the filters SHALL return the dashboard to all executions. The list's sort SHALL not change the dashboard.

#### Scenario: Filtering by environment
- **WHEN** a member filters the list to the Staging environment
- **THEN** every tile, chart and runs-table row counts only Staging executions, and the notice names "Environment: Staging"

#### Scenario: Clearing the filters
- **WHEN** the member clears every list filter
- **THEN** the notice disappears and the dashboard covers every execution

### Requirement: The dashboard shows four stat tiles
The dashboard SHALL show four tiles for its scope: **Executions** ("N active"), **Total Runs** ("N completed"), **Pass Rate** ("X of Y runs", or "no results yet") and **Avg Duration** in seconds with one decimal, or "—" ("per test run"). Each tile SHALL follow the PRD §6.12.4 stat tile.

#### Scenario: Reading the tiles
- **WHEN** the scope has 3 executions, 1 Paused, and 12 runs of which 8 are completed and 6 passed
- **THEN** the tiles read Executions 3 "1 active", Total Runs 12 "8 completed", Pass Rate 75% "6 of 8 runs" and Avg Duration "—"

### Requirement: The dashboard shows two trend charts and two donuts
The dashboard SHALL show Executions Over Time (a line of executions completed per day), Runs Over Time (stacked bars of runs completed per day: Passed, Failed, Needs Review), Execution Status (a donut of executions per status, sorted by count, in the execution status colours) and Run Outcomes (a donut of runs by current outcome).

#### Scenario: Execution status colours
- **WHEN** the scope has Draft, In Progress and Canceled executions
- **THEN** their parts are grey, blue and muted red

#### Scenario: Each chart its own range
- **WHEN** a member sets Runs Over Time to 7 days
- **THEN** Executions Over Time keeps its own range

### Requirement: The Execution Status donut sets the list's status filter
Selecting a part of the Execution Status donut SHALL set the execution list's status filter to that status, and the whole dashboard SHALL follow it. Selecting the part of the status already filtered SHALL clear the status filter.

#### Scenario: Selecting Done
- **WHEN** a member selects Done in the Execution Status donut
- **THEN** the list shows only Done executions, the notice names "Status: Done", and the tiles count only Done executions

#### Scenario: Selecting it again
- **WHEN** the member selects Done again
- **THEN** the status filter is cleared

### Requirement: The run charts filter the runs table
Selecting a Runs Over Time segment SHALL filter the runs table to that day and outcome and switch it to All Runs. Selecting a Run Outcomes part SHALL filter it to that outcome, clear any day filter and switch it to All Runs. Selecting the active segment or part again SHALL clear that filter.

#### Scenario: Selecting a day's failures
- **WHEN** a member selects the Failed segment of 4 March while the table shows Needs Attention
- **THEN** the table switches to All Runs and lists only runs that failed on 4 March

#### Scenario: Selecting an outcome after a day
- **WHEN** a day filter is on and the member selects Pass in Run Outcomes
- **THEN** the day filter is cleared and the table lists every Pass run

#### Scenario: Selecting it again
- **WHEN** the member selects Pass in Run Outcomes again
- **THEN** the outcome filter is cleared

### Requirement: The runs table has two tabs and layered filters
The runs table SHALL list the scope's runs under two tabs: **Needs Attention** (the default; runs whose outcome is Needs Review, with a count) and **All Runs**. Filters SHALL apply in order: the tab, the outcome filter, the day-and-outcome filter, then a name filter matching the test case's or the execution's name.

#### Scenario: The default tab
- **WHEN** a member opens the dashboard with 4 Needs Review runs in scope
- **THEN** the Needs Attention tab is open, reads a count of 4 and lists those 4 runs

#### Scenario: Filtering by execution name
- **WHEN** the member types "smoke" in the name filter on All Runs
- **THEN** only runs whose test case or execution name contains "smoke" are listed

### Requirement: The runs table names its chart filter
While a chart filter is on, the runs table SHALL name it next to a **Clear filter** control, for example "Pass" or "4 Mar · Failed". Clear filter SHALL clear the outcome and day-and-outcome filters, and keep the tab and the name filter.

#### Scenario: Clearing a day filter
- **WHEN** the table reads "4 Mar · Failed" and the member presses Clear filter
- **THEN** the label disappears and the table lists every run of the open tab that matches the name filter

### Requirement: The runs table's columns are sortable
The runs table SHALL show Order, Test Case (its name; the failed step in red, when recorded; the execution's name below), Outcome, Attempts, Bugs (red above 0), Created and Last Updated, and each column SHALL sort ascending or descending.

#### Scenario: Sorting by bugs
- **WHEN** a member sorts by Bugs, descending
- **THEN** the run with the most linked bugs is listed first

#### Scenario: A failed step
- **WHEN** a run's current attempt has a bug naming the failed step "Then the total is $10"
- **THEN** that step shows in red under the run's test case name

### Requirement: The runs table loads progressively
The runs table SHALL show its first rows and load more as the member scrolls, with an "N of M" counter. Changing any filter, tab or sort SHALL start again from the top. Selecting a row SHALL open that run in its execution, in a new tab. An empty Needs Attention SHALL read "No runs need review.", any other empty view "No runs match this filter.".

#### Scenario: Scrolling
- **WHEN** All Runs has 120 runs and the member scrolls to the end of the shown rows
- **THEN** more rows are added and the counter reads the new count "of 120"

#### Scenario: Opening a run
- **WHEN** the member selects a row
- **THEN** a new tab opens that execution with the run's panel open

#### Scenario: Nothing to review
- **WHEN** no run in scope is Needs Review
- **THEN** the Needs Attention tab reads "No runs need review."

### Requirement: The export dialog collects the report options
The dashboard SHALL show **Download report**, or **Download filtered report** while any list filter, chart filter, runs name filter or the Needs Attention tab is on. It SHALL open a dialog with a **Test Executions** switch (on, with the scope's count), a **Runs** switch (off, labelled "Needs Attention" or "Runs" by tab), and a notice of the active filters.

#### Scenario: The default label
- **WHEN** a member opens the dashboard with no list filter
- **THEN** the button reads "Download filtered report", since Needs Attention is open

#### Scenario: All runs, no filters
- **WHEN** the member switches to All Runs with no list or chart filter
- **THEN** the button reads "Download report"

#### Scenario: The Runs switch follows the tab
- **WHEN** the member opens the dialog from the All Runs tab
- **THEN** the second switch reads "Runs"

### Requirement: Download PDF waits for report generation
The dialog's **Download PDF** SHALL be disabled while both switches are off. Until report generation exists (PRD §8), it SHALL stay disabled and say that PDF export is not available yet.

#### Scenario: Both switches off
- **WHEN** the member turns off both switches
- **THEN** Download PDF is disabled

#### Scenario: Before report generation
- **WHEN** the member opens the dialog with Test Executions on
- **THEN** Download PDF is disabled and the dialog says PDF export is not available yet

### Requirement: The dashboard ends with a two-tab History panel
The dashboard SHALL end with a History panel, collapsed by default, with **Executions** and **Runs** tabs, each showing that area's latest 5 activity entries worded as on the Activity screen, with a count badge ("5+" when there are more). "See full history" SHALL open the paged history of the open tab.

#### Scenario: The Runs tab
- **WHEN** a member expands History and opens the Runs tab in a project with 8 run entries
- **THEN** the latest 5 run entries are shown and the badge reads "5+"

#### Scenario: Full history of the open tab
- **WHEN** the member presses "See full history" on the Runs tab
- **THEN** a dialog lists the project's run entries, loading older ones on demand
