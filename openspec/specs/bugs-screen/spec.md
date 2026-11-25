# bugs-screen Specification

## Purpose

Gives project members a web screen to track bugs: the bug list, each bug's detail with its linked run, test case and script snapshot, inline editing of its fields and status, and filing new bugs.

## Requirements

### Requirement: The Bugs screen lists the project's bugs
The Bugs screen SHALL list every non-deleted bug of the user's project, showing each bug's title, a color-coded severity indicator, and its status.

#### Scenario: Listing bugs
- **WHEN** a project member opens the Bugs screen in a project with two bugs
- **THEN** both are listed with their title, severity indicator, and status

#### Scenario: No bugs yet
- **WHEN** a project member opens the Bugs screen in a project with no bugs
- **THEN** an empty state is shown, with a way to file one if the user is a Contributor or above

### Requirement: The bug list can be sorted and filtered
The Bugs screen SHALL let the user sort the list by last updated, creation date, status, or severity, ascending or descending, and filter it by title text, status, severity, and tags (any of the picked tags). The default is last updated, newest first.

#### Scenario: Sorting by severity
- **WHEN** the user sorts by severity descending
- **THEN** Critical bugs are listed first and Low bugs last

#### Scenario: Filtering by status
- **WHEN** the user filters by status Open
- **THEN** only Open bugs are listed

#### Scenario: Filtering by tags
- **WHEN** the user picks "checkout" and "payments" in the Tags filter
- **THEN** only bugs carrying "checkout" or "payments" are listed

### Requirement: Selecting a bug shows its detail
Selecting a bug SHALL show its title, status, severity, reporter, description, steps to reproduce, linked test run (execution name, run position, run outcome, with a link to the execution), linked test case (with a link to it), and its Gherkin snapshot with the failed step highlighted. Links to deleted items SHALL be shown as deleted instead of navigable.

#### Scenario: A bug filed from a run
- **WHEN** a project member selects a bug filed from run 2 of execution "Smoke" with failed step "Then the total is $10"
- **THEN** the detail links to execution "Smoke" with run 2, links to the test case, and shows the snapshot with that line highlighted

#### Scenario: A manually filed bug
- **WHEN** a project member selects a bug filed without a run
- **THEN** the linked run, linked test case and snapshot sections say there is none

#### Scenario: Linked test case was deleted
- **WHEN** the bug's linked test case has been deleted
- **THEN** the test case is shown as deleted and is not a link

### Requirement: Contributors edit a bug inline
For Contributors and Admins, the detail SHALL allow changing the title, status (Open, In Progress, Resolved, Closed, Won't Fix — any to any), and severity inline, and editing description and steps to reproduce, saved when the field loses focus. Viewers SHALL see the same fields read-only.

#### Scenario: Changing status
- **WHEN** a Contributor changes a bug's status from Open to In Progress
- **THEN** the detail and the list show In Progress

#### Scenario: Viewer sees read-only fields
- **WHEN** a Viewer selects a bug
- **THEN** no field can be edited

### Requirement: Contributors file bugs from the Bugs screen
Contributors and Admins SHALL be able to file a bug from the Bugs screen with a title (required), severity (default Medium), description, steps to reproduce, and tags picked or created with the tag picker. The new bug opens selected.

#### Scenario: Filing from the Bugs screen
- **WHEN** a Contributor files a bug with a title and severity High
- **THEN** the new bug is selected, Open, and shown in the list

#### Scenario: Filing with tags
- **WHEN** a Contributor picks "checkout" and creates the new tag "payments" in the form, then files the bug
- **THEN** the new bug carries both tags

#### Scenario: Title is required
- **WHEN** a Contributor saves the form without a title
- **THEN** the form shows the title is required and nothing is saved

### Requirement: An Admin can delete a bug after confirming
Deleting SHALL be offered only to Admins, ask for confirmation, then remove the bug from the list and clear the selection.

#### Scenario: Deleting a bug
- **WHEN** an Admin deletes a bug and confirms
- **THEN** it disappears from the list and the detail panel is cleared

### Requirement: The bug detail shows and edits its tags
The bug detail SHALL show the bug's tags as coloured badges. For Contributors and Admins it SHALL offer the tag picker, which adds or removes a tag on selection and saves at once, and can create a tag from typed text. Viewers SHALL see the badges only. The Bugs list's Tags filter SHALL also offer Manage tags.

#### Scenario: Tagging a bug
- **WHEN** a Contributor opens a bug's tag picker and selects "regression"
- **THEN** the "regression" badge appears on the bug and stays after a reload

#### Scenario: Viewer sees badges only
- **WHEN** a Viewer opens a bug that carries tags
- **THEN** the badges are shown and no tag picker is offered

#### Scenario: Managing tags from the Bugs screen
- **WHEN** a Contributor chooses Manage tags in the Bugs list's Tags filter
- **THEN** the Manage tags dialog opens

### Requirement: The bug detail shows its history
The bug detail SHALL include a History section listing the bug's own activity entries, newest first, each as a sentence naming who did what and when, 20 at a time with "Load more". It SHALL refresh after the user edits the bug.

#### Scenario: Reading a bug's history
- **WHEN** a Viewer opens a bug that Ana filed and Bo moved from Open to Resolved
- **THEN** the History section lists Bo's status change first, then Ana filing the bug

#### Scenario: Refreshed by an edit
- **WHEN** a Contributor changes the bug's severity in the detail
- **THEN** the severity change appears first in the History section

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
The dashboard SHALL start with the heading "Dashboard", the line "Aggregate bug metrics for this project" and a **Download report** button. Pressing it SHALL request the Bugs dashboard report with the viewer's time zone and the range selected on the Reported vs Resolved charts.

#### Scenario: Before report generation
- **WHEN** a member opens the dashboard of a project with bugs and has not requested a report
- **THEN** Download report is shown and enabled, with no note that PDF export is unavailable

#### Scenario: Requesting the report
- **WHEN** a member sets the charts to 15 days and presses Download report
- **THEN** a Bugs dashboard report is requested with range 15 and the browser's time zone

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

### Requirement: Download report shows the report's progress and downloads it when ready
While the requested report is Queued or Generating, the button SHALL read "Generating…" and be disabled. When the report becomes Ready, the browser SHALL download the PDF and the button SHALL return to Download report. If the report fails, or the request is refused, the dashboard SHALL say "The report couldn't be generated." with a Try again button that requests it again.

#### Scenario: Generating, then downloaded
- **WHEN** a member presses Download report and the report becomes Ready
- **THEN** the button reads "Generating…" until then, the PDF is downloaded, and the button reads Download report again

#### Scenario: The report fails
- **WHEN** the requested report ends Failed
- **THEN** the dashboard shows "The report couldn't be generated." and Try again requests a new report

### Requirement: The dashboard learns of a finished report without a reload
The dashboard SHALL notice that the report has finished from the project's live events, and SHALL also check the report's status every few seconds while it is generating, so it finishes even when the event stream is down.

#### Scenario: The stream is down
- **WHEN** the event stream is disconnected while a report is generated
- **THEN** the PDF is still downloaded once the report is Ready
