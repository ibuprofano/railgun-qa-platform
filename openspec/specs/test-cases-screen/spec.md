# test-cases-screen Specification

## Purpose

Gives project members the web Test Cases screen as a folder tree: browsing, filtering, organizing by drag and drop or menus, and seeing each folder's and test case's place in the hierarchy.

## Requirements

### Requirement: The Test Cases screen shows an expandable folder tree
The left panel SHALL show the project's folders and test cases as a tree: folders before test cases within each folder, each in their stored order, root items at the top level. Folders SHALL expand and collapse, and the expanded set SHALL be remembered in the browser. Each test case SHALL show a colored dot for its last run outcome, or none if never run.

#### Scenario: Browsing the tree
- **WHEN** a member opens Test Cases in a project with folder "Checkout" (holding test case "Pay") and root test case "Login"
- **THEN** the tree shows "Checkout" above "Login", and expanding "Checkout" reveals "Pay"

#### Scenario: Expansion is remembered
- **WHEN** a member expands "Checkout" and reloads the page
- **THEN** "Checkout" is still expanded

#### Scenario: Outcome dot
- **WHEN** test case "Pay" last ran with outcome Fail
- **THEN** "Pay" shows the fail-colored dot, and a never-run test case shows none

### Requirement: The tree can be filtered by name and status
Filtering by name text and/or test case status SHALL show the matching test cases and folders whose names match, together with the folders above them, expanded so matches are visible.

#### Scenario: Filtering by name
- **WHEN** a member filters by "pay"
- **THEN** test case "Pay" is shown inside "Checkout" (expanded), and unrelated items are hidden

### Requirement: Contributors organize the tree by drag and drop
Contributors and Admins SHALL be able to drag a folder or test case to reorder it among its siblings, or drop it onto a folder to move it inside, using a mouse or the keyboard. Refused moves SHALL explain why and leave the tree unchanged. Viewers SHALL NOT be able to drag items.

#### Scenario: Moving a test case by drag and drop
- **WHEN** a Contributor drags test case "Pay" onto folder "Refunds"
- **THEN** "Pay" appears inside "Refunds"

#### Scenario: Moving with the keyboard
- **WHEN** a Contributor focuses "Pay", picks it up with the keyboard, moves it to a new position and drops it
- **THEN** "Pay" is moved there as with the mouse

#### Scenario: A too-deep move is explained
- **WHEN** a Contributor drops a folder where it would exceed four levels
- **THEN** the screen says why and the tree is unchanged

### Requirement: Every tree item has an actions menu
Every item SHALL offer an actions menu, opened by right-click or a visible button. For Contributors and Admins it SHALL offer: New folder here and New test case here (on folders and the root), Rename, Move to… (a folder picker), and Delete (Admin only). Viewers SHALL be offered no create, rename, move, or delete action.

#### Scenario: Move to… from the menu
- **WHEN** a Contributor chooses Move to… on "Pay" and picks "Refunds"
- **THEN** "Pay" appears inside "Refunds"

#### Scenario: Viewers cannot reorganize
- **WHEN** a Viewer opens an item's actions menu
- **THEN** no create, rename, move, or delete action is offered, and items cannot be dragged

### Requirement: Selecting a folder shows its summary
Selecting a folder SHALL show its breadcrumb path, its number of subfolders and test cases (direct and in total), and its actions. Deleting a folder SHALL ask for confirmation stating how many folders and test cases will be deleted.

#### Scenario: Folder summary
- **WHEN** a member selects "Checkout", holding subfolder "Payments" and 3 test cases in total (1 directly)
- **THEN** the summary shows the breadcrumb, 1 subfolder, 1 direct and 3 total test cases

#### Scenario: Confirming a folder delete
- **WHEN** an Admin deletes "Checkout"
- **THEN** the confirmation says 2 folders and 3 test cases will be deleted, and confirming removes them from the tree

### Requirement: Test case detail shows its place in the tree
Selecting a test case SHALL show its breadcrumb path through its folders above the existing detail.

#### Scenario: Breadcrumb
- **WHEN** a member selects test case "Pay" inside "Checkout / Payments"
- **THEN** the detail shows the breadcrumb "Checkout / Payments"

### Requirement: New test cases choose a destination folder
The new-test-case form SHALL let Contributors choose the destination folder from a tree picker (or the root), defaulting to the currently selected folder, or to the folder whose "New test case here" was chosen.

#### Scenario: Creating in the selected folder
- **WHEN** a Contributor has "Payments" selected and creates a test case without changing the destination
- **THEN** the new test case appears inside "Payments" and is selected

### Requirement: New Test Case opens as a modal
For Contributors and Admins, New test case (in the screen header or a folder's "New test case here") SHALL open the New Test Case modal (PRD §7.1) with a name, the destination folder picker, and an optional Gherkin script. The tree and detail pane SHALL stay as they were behind it. Saving SHALL close the modal and select the created test case, showing it in the detail pane.

#### Scenario: Creating from the header
- **WHEN** a Contributor with a test case selected chooses New test case, enters a name, and saves
- **THEN** the modal closes, the new test case appears in the tree and is selected, and the detail pane shows it

#### Scenario: Cancelling keeps the selection
- **WHEN** a Contributor with folder "Payments" selected opens New test case and cancels
- **THEN** the modal closes and "Payments" is still selected and shown

#### Scenario: From a folder's actions menu
- **WHEN** a Contributor chooses "New test case here" on folder "Cards"
- **THEN** the modal opens with "Cards" as the destination folder

#### Scenario: Name is required
- **WHEN** a Contributor saves the modal without a name
- **THEN** the modal shows that the name is required and nothing is saved

### Requirement: The test case detail shows and edits its tags
The test case detail SHALL show the test case's tags as coloured badges, and the New Test Case modal SHALL offer the same tag picker for the tags to create it with. For Contributors and Admins the detail SHALL offer a tag picker that searches the project's tags, adds or removes one on selection and saves at once, and offers to create a tag when the typed name doesn't exist yet. Viewers SHALL see the badges only.

#### Scenario: Adding an existing tag
- **WHEN** a Contributor opens the tag picker on a test case and selects "smoke"
- **THEN** the "smoke" badge appears on the test case and stays after a reload

#### Scenario: Creating a tag from the picker
- **WHEN** a Contributor types "payments" in the picker, where no such tag exists, and chooses to create it
- **THEN** the tag is created and added to the test case

#### Scenario: Tagging a new test case
- **WHEN** a Contributor opens New Test Case, picks "smoke" and creates the new tag "payments" in its tag picker, then saves
- **THEN** the created test case carries both tags

#### Scenario: Viewer sees badges only
- **WHEN** a Viewer opens a test case that carries tags
- **THEN** the badges are shown and no tag picker is offered

### Requirement: The tree can be filtered by tags
The Test Cases tree SHALL offer a Tags filter where the user picks one or more tags. With tags picked, the tree SHALL show the test cases carrying any of them, plus the folders above those test cases, combined with the name and status filters. Drag and drop SHALL be paused while it is active, as with the other filters.

#### Scenario: Filtering by two tags
- **WHEN** the user picks "smoke" and "regression" in the Tags filter
- **THEN** only test cases carrying "smoke" or "regression" are shown, inside their folders

#### Scenario: Combined with status
- **WHEN** the user picks the tag "smoke" and the status `Ready`
- **THEN** only Ready test cases carrying "smoke" are shown

### Requirement: Tags are managed in a Manage tags dialog
The Tags filter SHALL offer Manage tags, which lists every tag of the project with its colour and the number of test cases and bugs carrying it. Contributors and Admins SHALL be able to rename a tag and pick its colour from the palette there; Admins SHALL be able to delete a tag after confirming a message that states how many test cases and bugs carry it. Viewers SHALL see the list without edit controls.

#### Scenario: Recolouring a tag
- **WHEN** a Contributor opens Manage tags and picks blue for "smoke"
- **THEN** every "smoke" badge on the screen turns blue

#### Scenario: Deleting a tag after confirming
- **WHEN** an Admin deletes "legacy", which three test cases and one bug carry, and confirms the message stating three test cases and one bug
- **THEN** "legacy" disappears from the dialog, the filter, those test cases, and the bug

#### Scenario: A refused rename keeps the old name
- **WHEN** a Contributor renames a tag to a name another tag already has
- **THEN** the dialog shows the server's reason and the tag keeps its name

#### Scenario: Contributors can't delete
- **WHEN** a Contributor opens Manage tags
- **THEN** rename and colour controls are offered and no delete control is

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

### Requirement: The Test Cases dashboard has a header with Download report
The dashboard SHALL start with the heading "Dashboard" and a **Download report** button. Pressing it SHALL request the Test Cases dashboard report with the viewer's time zone, the range selected on each trend chart, and the Needs Attention name filter and sort as shown. The button SHALL be available to every member who can see the dashboard.

#### Scenario: Before report generation
- **WHEN** a Viewer opens the dashboard of a project with test cases and has not requested a report
- **THEN** Download report is shown and enabled

#### Scenario: Requesting the report
- **WHEN** a member sets Test Cases Over Time to 30 days and Pass Rate Trend to 7, filters Needs Attention by "pay", sorts it by Last Updated twice, and presses Download report
- **THEN** a Test Cases dashboard report is requested with the browser's time zone, ranges 30 and 7, the filter "pay" and a sort by Last Updated, descending

#### Scenario: Pass Rate Trend hidden
- **WHEN** no run in the project has completed and a member presses Download report
- **THEN** the report is requested with Pass Rate Trend's default range

### Requirement: Download report on the Test Cases dashboard shows progress and downloads when ready
While the requested report is Queued or Generating, the button SHALL read "Generating…" and be disabled. When the report becomes Ready, the browser SHALL download the PDF and the button SHALL return to Download report. If the report fails, or the request is refused, the dashboard SHALL say "The report couldn't be generated." with a Try again button that requests it again.

#### Scenario: Generating, then downloaded
- **WHEN** a member presses Download report and the report becomes Ready
- **THEN** the button reads "Generating…" until then, the PDF is downloaded, and the button reads Download report again

#### Scenario: The report fails
- **WHEN** the requested report ends Failed
- **THEN** the dashboard shows "The report couldn't be generated." and Try again requests a new report

### Requirement: The Test Cases dashboard learns of a finished report without a reload
The dashboard SHALL notice that the report has finished from the project's live events, and SHALL also check the report's status every few seconds while it is generating, so it finishes even when the event stream is down.

#### Scenario: The stream is down
- **WHEN** the event stream is disconnected while a report is generated
- **THEN** the PDF is still downloaded once the report is Ready
