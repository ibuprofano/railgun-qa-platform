# overview-screen Specification

## Purpose

The web Overview screen (PRD §6.1): the active project's health at a glance, with its KPI tiles, the tests and bugs that need attention, and recent activity, for every project member.

## Requirements

### Requirement: The Overview shows the project's seven KPI tiles
The web app SHALL offer an Overview screen for the active project to every member with at least Viewer access. It SHALL show a header with "Overview" and the project's name, then seven tiles: Health Score, Total Test Cases, Coverage, Pass Rate, Active Runs, Open Bugs and Critical Bugs, each with its value and sub-label.

#### Scenario: Sub-labels
- **WHEN** a member opens the Overview of a project with test cases, runs and bugs
- **THEN** the tiles' sub-labels read the band name, "N% ready", "run at least once", "last 30 days", "executions in progress", "open + in progress" and "open critical"

#### Scenario: No recent runs
- **WHEN** the project has no runs completed in the last 30 days
- **THEN** the Pass Rate tile shows "—"

### Requirement: The Health Score tile shows its band and explains itself
The Health Score tile SHALL show the score, with its value, icon and outline in the band's colour: green for Healthy, amber for At Risk, red for Critical. Without a score it SHALL show "No data", in neutral colours. Every tile with a derived value SHALL offer an info tooltip in plain words. The Health Score's tooltip SHALL name its four components and their weights.

#### Scenario: An at-risk project
- **WHEN** the project's score is 72
- **THEN** the tile shows "72" and "At Risk" in amber

#### Scenario: The tooltip
- **WHEN** a member opens the Health Score tile's info tooltip
- **THEN** it names pass rate 40%, coverage 20%, bug pressure 25% and freshness 15%

### Requirement: Top Failing Tests shows the worst test cases and links to them
The screen SHALL show a Top Failing Tests panel. Each row SHALL show the test case's name, its fail rate (red at 75% or more, amber at 40% or more) and "X of Y runs failed", and SHALL open the test case on the Test Cases screen in a new tab. When failing test cases have fewer than 3 completed runs, the panel SHALL say how many: in place of the rows when none qualify, or below them otherwise. Only when no test case has failed SHALL the panel read "No failing tests — nice!".

#### Scenario: A failing test
- **WHEN** "Pay with card" failed 3 of its 4 runs
- **THEN** its row reads "75%" in red and "3 of 4 runs failed", and links to that test case

#### Scenario: No failing tests
- **WHEN** no test case has failed
- **THEN** the panel reads "No failing tests — nice!"

#### Scenario: Failing but too few runs
- **WHEN** no test case qualifies and 2 failing test cases have fewer than 3 completed runs
- **THEN** the panel reads "2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet."

### Requirement: Urgent Bugs shows open Critical and High bugs and links to them
The screen SHALL show an Urgent Bugs panel. Each row SHALL show a severity badge, the title and "<status> · opened <relative time>", and SHALL open the bug on the Bugs screen in a new tab. With none, the panel SHALL read "No critical or high open bugs.".

#### Scenario: An urgent bug
- **WHEN** an Open Critical bug "Checkout total wrong" was reported 3 days ago
- **THEN** its row shows a Critical badge, the title and "Open · opened 3 days ago", and links to that bug

#### Scenario: Nothing urgent
- **WHEN** the project has no open Critical or High bugs
- **THEN** the Urgent Bugs panel reads "No critical or high open bugs."

### Requirement: Recent History shows the latest activity with a full history on demand
The screen SHALL show the 10 most recent activity entries of the project, newest first. Each SHALL have the actor's initials, the action as a sentence coloured by its kind, the entity's icon and a relative time, worded as on the Activity screen. A **Full History** link SHALL open a dialog with the project's complete feed, which loads older entries on demand.

#### Scenario: The latest ten
- **WHEN** a project has 25 activity entries
- **THEN** Recent History shows the 10 newest

#### Scenario: Full history
- **WHEN** a member selects Full History and then "Load more"
- **THEN** the dialog lists the feed newest first and adds older entries below

### Requirement: The Overview has loading, empty and error states
While the figures load, each tile and panel SHALL show a placeholder shaped like its content. If they cannot be loaded, the screen SHALL show an error with a way to retry. Each panel SHALL have its own empty line, and an empty project SHALL still show every tile.

#### Scenario: A new project
- **WHEN** a member opens the Overview of a project with no test cases, runs or bugs
- **THEN** the tiles show 0 or "No data", and each panel shows its empty line

#### Scenario: Loading fails
- **WHEN** the figures cannot be loaded
- **THEN** an error state with a Retry action is shown

### Requirement: The Overview shows its four charts in the PRD layout
Below the KPI tiles, the Overview SHALL show the Health Score trend at full width, then the Pass Rate trend and Bug Velocity side by side, then the Run Outcomes donut next to the Top Failing Tests and Urgent Bugs panels. Each trend chart SHALL keep its own range.

#### Scenario: The layout
- **WHEN** a member opens the Overview on a wide screen
- **THEN** the Health Score trend spans the width, the two trends share a row, and the donut sits beside the two panels

### Requirement: The Health Score trend shows each day's score
The Health Score trend SHALL draw the score per UTC day over its range, with today's point equal to the Health Score tile. Days without a score SHALL be left off the line. With no score in the range, it SHALL read "No data yet.".

#### Scenario: Matching the tile
- **WHEN** the Health Score tile shows 62
- **THEN** the trend's last point is 62

#### Scenario: A new project
- **WHEN** the project has no completed run
- **THEN** the chart reads "No data yet."

### Requirement: Pass Rate and Bug Velocity trends show daily figures
The Pass Rate trend SHALL draw each day's pass rate, explaining in its tooltip that days without runs are drawn as 0. Bug Velocity SHALL draw two series, Reported and Resolved, per day.

#### Scenario: A busy day
- **WHEN** 8 of 10 runs completed on 12 November passed
- **THEN** the Pass Rate trend shows 80% for 12 November

#### Scenario: Reported versus resolved
- **WHEN** 3 bugs were reported and 1 resolved on 12 November
- **THEN** Bug Velocity shows Reported 3 and Resolved 1 for that day

### Requirement: Run Outcomes shows the last 30 days' split
The Run Outcomes donut SHALL show the Pass, Fail and Needs Review split of the last 30 days, with a fixed range and no selector. With no completed runs, it SHALL read "No completed runs yet.".

#### Scenario: No recent runs
- **WHEN** no run was completed in the last 30 days
- **THEN** the donut reads "No completed runs yet."
