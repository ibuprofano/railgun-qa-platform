# Spec Delta

## ADDED Requirements

### Requirement: The Bugs dashboard is the default right panel
With no bug in the address, the right panel SHALL show the Bugs dashboard. Selecting a bug, or opening an address that links to one, SHALL show its detail. A Dashboard toggle in the list's header SHALL clear the selection and show the dashboard, and SHALL show as pressed while the dashboard is shown.

#### Scenario: Opening the screen
- **WHEN** a member opens Bugs with no bug in the address
- **THEN** the right panel shows the dashboard and the Dashboard toggle is pressed

#### Scenario: A link to a bug
- **WHEN** a member opens Bugs with `?bug=<id>`
- **THEN** that bug's detail is shown, not the dashboard

#### Scenario: Returning to the dashboard
- **WHEN** a member viewing a bug presses the Dashboard toggle
- **THEN** the bug is deselected, the address no longer names it, and the dashboard is shown

### Requirement: The Bugs dashboard shows current data, a loading state and an empty state
Showing the dashboard SHALL always fetch current data. While loading, it SHALL show a title placeholder and four tile placeholders. A project with no bugs SHALL show "No bugs yet" with the hint "Report a bug to start seeing metrics", and no widgets or download button.

#### Scenario: Switching back refreshes
- **WHEN** a member resolves a bug in its detail, then presses the Dashboard toggle
- **THEN** the dashboard is fetched again and counts the bug as resolved

#### Scenario: Loading
- **WHEN** the dashboard's data has not arrived yet
- **THEN** a title placeholder and four tile placeholders are shown

#### Scenario: Empty project
- **WHEN** a member opens Bugs in a project with no live bugs
- **THEN** the right panel shows "No bugs yet" and "Report a bug to start seeing metrics", with no tiles, charts or download button

### Requirement: The Bugs dashboard has a header with Download report
The dashboard SHALL start with the heading "Dashboard", the line "Aggregate bug metrics for this project" and a **Download report** button. Until report generation exists (PRD §8), the button SHALL be disabled and say that PDF export is not available yet.

#### Scenario: Before report generation
- **WHEN** a member opens the dashboard of a project with bugs
- **THEN** Download report is shown, disabled, with a note that PDF export is not available yet

### Requirement: The Bugs dashboard shows four stat tiles
The dashboard SHALL show four tiles: **Total Bugs** ("N in progress"), **Open** ("needs attention"), **Resolved** ("of N total") and **Critical (all time)** ("highest severity"), with the values of the bug-metrics rules. Each tile SHALL follow the PRD §6.12.4 stat tile, and Critical's info tooltip SHALL say it counts every status, unlike the Overview's Critical Bugs.

#### Scenario: Reading the tiles
- **WHEN** the project has 7 bugs, 1 In Progress, 2 Open, 2 Resolved and 2 Critical
- **THEN** the tiles read Total Bugs 7 "1 in progress", Open 2 "needs attention", Resolved 2 "of 7 total" and Critical (all time) 2 "highest severity"

### Requirement: The two Reported vs Resolved charts share one range
The dashboard SHALL show Reported vs Resolved and Reported vs Resolved — Critical, each a line chart with a Reported series in red and a Resolved series in green. The two charts SHALL share one range selector (7, 15, 30 or 90 days, default 30): changing it SHALL change both.

#### Scenario: Changing the range
- **WHEN** a member sets the range to 7 days
- **THEN** both charts show the last 7 days

#### Scenario: Hiding a series
- **WHEN** a member hides Reported in the Critical chart's legend
- **THEN** that chart draws only Resolved, and the other chart still draws both

### Requirement: The Bugs dashboard shows four donuts
The dashboard SHALL show, in two rows, All Bugs by Severity and All Bugs by Status, then Open by Severity and Backlog Age, each a donut following PRD §6.12.4. Severity parts SHALL use the severity colours, status parts the bug status colours, and Backlog Age Fresh green, Aging amber and Old red. Backlog Age SHALL have an info tooltip explaining its three buckets.

#### Scenario: Severity colours
- **WHEN** All Bugs by Severity shows Critical, High, Medium and Low parts
- **THEN** they are red, orange, amber and blue

#### Scenario: No open bugs
- **WHEN** every bug of the project is resolved
- **THEN** Open by Severity and Backlog Age each show their empty-state line instead of a donut

### Requirement: Avg Resolution Time lists each severity's average
The dashboard SHALL show Avg Resolution Time next to Bugs by Tag. Each row SHALL show the severity's colour dot, its name, the average as "Nd" and "(n bugs)". With no resolved bug, it SHALL show "No resolved bugs yet".

#### Scenario: Reading a row
- **WHEN** two High bugs were resolved after 4 days on average
- **THEN** the row reads High "4d" "(2 bugs)"

#### Scenario: Nothing resolved
- **WHEN** no bug of the project is resolved
- **THEN** the card shows "No resolved bugs yet"

### Requirement: Bugs by Tag shows a tag word cloud
The dashboard SHALL show Bugs by Tag as a word cloud of the tags carried by live bugs, each word in its tag's colour and sized by its count. With no tagged bug, it SHALL show "No tagged bugs yet."

#### Scenario: Tags in use
- **WHEN** "checkout" is carried by 4 bugs and "ui" by 1
- **THEN** the cloud shows "checkout" larger than "ui", each in its tag's colour

#### Scenario: No tags
- **WHEN** no live bug carries a tag
- **THEN** the card shows "No tagged bugs yet."

### Requirement: The Needs Attention table lists idle and unattended bugs
The dashboard SHALL end with the Needs Attention table when it has rows, and leave it out otherwise. Its heading SHALL show the row count and an info tooltip defining Idle and Unattended. Its columns SHALL be Bug (the title, truncated when long), Issue (an amber Idle and a red Unattended badge), Severity (colour dot and name) and Status, in the bug-metrics order.

#### Scenario: Reading the table
- **WHEN** an Open High bug was updated yesterday and an In Progress Low bug was last updated 45 days ago
- **THEN** the heading counts 2, the High bug is listed first with Unattended, and the Low bug second with Idle

#### Scenario: Nothing needs attention
- **WHEN** no open bug is Idle or Unattended
- **THEN** the Needs Attention table is not shown

### Requirement: A Needs Attention row opens its bug
Choosing a Needs Attention row, by pointer or keyboard, SHALL select that bug, so the right panel shows its detail and the address names it.

#### Scenario: Opening a bug
- **WHEN** a member chooses the row of bug "Lockout counter resets after a page reload"
- **THEN** the right panel shows that bug's detail and the address holds `?bug=<its id>`
