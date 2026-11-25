# Product Requirements Document
## QA Automation Platform

**Version:** 1.1  
**Status:** Living Document  
**Audience:** Product, Design, and AI-driven implementation agents

---

## 1. Product Overview

The QA Automation Platform is a collaborative web application for software quality assurance teams. It centralises the definition, organisation, execution, and tracking of test cases alongside defect management, giving teams a single source of truth for their testing process. The platform supports both manual and automated test execution and provides health dashboards, trend analytics, and exportable reports to communicate quality status to stakeholders.

---

## 2. Core Concepts

Before describing individual screens and flows, it is important to understand the primary entities and how they relate to one another.

### 2.1 Workspace
The highest organisational container. A workspace represents a company or team. Every user belongs to at least one workspace. All projects, users, and settings live within a workspace.

### 2.2 Project
A project represents a single application or product under test. It is the primary unit that organises test cases, executions, bugs, environments, tags, and folders. A user may have access to multiple projects within the same workspace, each with independently assigned roles.

### 2.3 Folder
An organisational container for test cases, nestable up to four levels deep. Folders can be renamed, reordered, and moved.

### 2.4 Tag
A coloured, named label that can be applied to both test cases and bugs to aid filtering and categorisation. Tags are created and managed per project.

### 2.5 Test Case
The fundamental unit of the platform. A test case is a single scenario to be tested. It may be written as an executable scenario (in Given/When/Then format, known as Gherkin) or as a non-executable manual description. A test case accumulates a run history over time, which the platform uses to compute health signals.

### 2.6 Environment
A named target configuration for running tests. Each environment has a base URL, a default browser preference, and one or more sets of stored credentials (each identified by a friendly alias, with an email and password). Environments are defined at the project level and selected when creating a test execution.

### 2.7 Test Execution
A batched grouping of test cases to be executed together in a single session. An execution records the conditions under which tests were run (environment, browser, viewport, locale, timezone) and tracks the overall and per-case outcomes. An execution moves through a defined lifecycle from creation to sign-off.

### 2.8 Test Run
One instance of a single test case within an execution. Each run has its own outcome (Pass, Fail, Needs Review, etc.) and may hold multiple attempts, step-by-step results, AI confidence scores, and linked bug reports.

### 2.9 Bug
A defect report tied to a specific observation or failing test. Bugs have a severity, a lifecycle status, optional images, and optional links to the test run and test case that exposed them. A bug records when it was resolved: the moment it enters Resolved, Closed or Won't Fix. Moving it back to Open or In Progress clears that date. Resolution metrics use this date (Section 6.12).

### 2.10 Activity Log
An immutable, chronological audit trail of every significant action taken within a project — who did what, to which entity, and when.

### 2.11 Trash
Deleting a test case, folder, execution, bug, or project does not remove it immediately. Deleted items move to a trash, where they can be restored for 30 days; after that they are permanently removed. While an item is in the trash it is hidden from all lists, dashboards, and reports.

How deletion affects related content:
- **Test case deleted:** a test case cannot be deleted while it is part of an execution that is Ready, In Progress, or Paused (a Draft execution does not block deletion; see ADR 0012); the Admin must first remove it from those executions. Once deleted, its past runs remain inside their executions, keeping the test case name and Gherkin script as they were when the execution started.
- **Execution deleted:** its runs are removed from all metrics, dashboards, and reports.
- **Folder deleted:** the folder is deleted together with all of its subfolders and test cases. A confirmation dialog shows how many items will be affected. A folder cannot be deleted while any test case inside it is part of a Ready, In Progress, or Paused (a Draft execution does not block deletion; see ADR 0012) execution.
- **Bug links to deleted items:** a bug that points to a deleted test case, run, or execution shows that link as "deleted" instead of a navigable link.
- **Project deleted:** the whole project, with everything in it, moves to the trash and can be restored by a Workspace Owner (Section 6.9).
- **Activity Log:** never deleted. Entries keep the name of the item as it was, even after the item is permanently removed.

---

## 3. User Roles & Permissions

Permissions operate at two levels: workspace and project. A user's workspace role is a ceiling that applies across all projects; their project role governs day-to-day access within a specific project.

### 3.1 Workspace Roles

| Role | Description |
|---|---|
| **Owner** | Full, unrestricted control over the workspace. Can create and delete projects, manage all members, rename the workspace, and transfer ownership. Automatically holds the Project Admin role on every project. |
| **Collaborator** | Can view the workspace and participate in projects to which they are explicitly invited. Cannot access workspace settings or create projects. May leave the workspace at any time. |

### 3.2 Project Roles

| Role | Capabilities |
|---|---|
| **Project Admin** | All Contributor capabilities plus: delete folders, delete test cases, delete bugs, delete executions, sign off completed executions, manage project settings (environments, project name, defaults), and restore deleted items from the Trash. |
| **Contributor** | Create and edit test cases, create and edit executions, start, pause, and resume executions, update run outcomes during active executions, file and update bugs, create tags, create and rename folders, and reveal environment credentials. Cannot delete. |
| **Viewer** | Read-only access to all project content, except that stored passwords stay masked. Cannot create, edit, or delete anything. |

**Key access rules:**
- Anyone can be invited to a project by email address, whether or not they already have an account (Section 3.3).
- Accepting a project invitation also adds the person to the workspace as a Collaborator, if they are not already a member.
- A Workspace Owner cannot leave the workspace until ownership has been transferred (Section 6.9).
- Destructive actions (delete) throughout the application are exclusively available to Project Admins and Workspace Owners.

### 3.3 Invitations

- A Project Admin or Workspace Owner invites someone by entering an email address and choosing a project role.
- **Existing users** receive an email and also see the invitation under Pending Invitations in the workspace switcher (Section 5).
- **New users** receive an email with a link. They sign up through it (no workspace name is requested and no workspace is created for them) and then see the invitation.
- Nobody is added automatically. A person joins only by explicitly accepting; they may also decline. Until accepted, an invitation grants no access.
- Accepting adds the person to the project with the invited role, and to the workspace as a Collaborator.
- Invitations expire after 7 days. Project Admins can revoke or resend pending invitations from Project Members (Section 6.8).
- Invitations can only be seen and accepted by an account whose email address is verified (Section 4.6). An invitation sent to an unverified account stays pending until the address is verified or the invitation expires. Signing up through the invitation link counts as verifying the invited address.
- Removing someone from a workspace removes them from all of its projects. Content they created remains, shown as created by "Former member" in the interface; the activity log keeps their name.

---

## 4. Authentication & Onboarding

### 4.1 Sign In
Users access the platform via an email and password form. On success, they are taken to the Test Cases screen for their last active project. On failure, an inline error message is shown. A link to the Sign Up screen is provided for new users, and a "Forgot password" link starts the password reset flow (Section 4.5).

### 4.2 Sign Up
New users register by providing: full name, work email, password (minimum 8 characters), and a workspace name. Submitting this form creates both the user account and their first workspace simultaneously. The new user is automatically signed in and redirected to the Onboarding screen, and a banner asks them to verify their email address (Section 4.6). Users who sign up through an invitation link (Section 3.3) are not asked for a workspace name and no workspace is created; they are taken to the pending invitation instead.

### 4.3 Onboarding Welcome Screen
Shown only on the first entry of a user who created a workspace at sign-up. Displays the newly created workspace name with a confirmation badge and presents three guided steps:
1. Create your first test case
2. Set up an environment
3. Run your first execution

Each step is a clickable card that navigates to the relevant section of the application. A "Go to the app" button allows the user to skip the guide and proceed directly to the main interface.

### 4.4 Sign Out
Available from the user menu in the sidebar. Signs the user out and redirects to the Sign In screen.

### 4.5 Password Reset
From the Sign In screen, the user enters their email address and receives an email with a reset link. The link opens a form for a new password (minimum 8 characters). The confirmation message is identical whether or not the email address belongs to an account, so the screen never reveals who is registered. After resetting, the user signs in with the new password.

### 4.6 Email Verification
After sign-up, a banner asks the user to verify their email address using a link sent by email; the user can keep using the application in the meantime. Until the address is verified, the account cannot see or accept invitations (Section 3.3). A "Resend verification email" option is available in the banner and on the User Profile. Because a user's email address cannot be changed, verification happens only once.

---

## 5. Navigation & Layout

The main application uses a persistent sidebar that contains:
- A **workspace switcher** at the very top. Its menu lists the user's workspaces (with a "Leave workspace" action for Collaborators), a **Pending Invitations** section where invitations can be accepted or declined, and a link to Workspace Settings (Owners only). The active workspace determines which projects appear in the project switcher. After signing in, the user lands on the last active project of the last active workspace.
- A **project switcher** just below it — a dropdown listing all projects the user can access in the active workspace. Selecting a project changes the active context for the entire application.
- Navigation links to all primary screens (Overview, Test Cases, Test Executions, Bugs, Test Automations, Activity, Project Settings, Project Members, and Trash for Project Admins and Workspace Owners).
- A user menu at the bottom linking to the User Profile and Sign Out.

---

## 6. Screens & Feature Specifications

---

### 6.1 Overview Dashboard

**Purpose:** A real-time health command centre for the active project, giving stakeholders an at-a-glance view of quality status and trends. Every figure follows the shared definitions in Section 6.12.

**Layout (top to bottom):**
1. **Header:** the title "Overview", the active project's name, and a **Download report** button once the data has loaded.
2. **KPI tiles:** the seven tiles in one row on wide screens, wrapping on narrower ones.
3. **Health Score trend:** a line chart across the full width.
4. **Pass Rate trend** and **Bug Velocity:** two line charts side by side.
5. **Run Outcomes donut, Top Failing Tests and Urgent Bugs:** three cards side by side.
6. **Recent History:** a feed with a **Full History** link.

**KPI Tiles (7 total):**

| Tile | Value | Definition | Sub-label |
|---|---|---|---|
| **Health Score** | 0–100, or "No data" | The composite score defined below | Healthy, At Risk or Critical. The value, icon and tile outline take the band's colour (green, amber, red). |
| **Total Test Cases** | count | All of the project's test cases | "N% ready": the share whose status is Ready |
| **Coverage** | % | Test cases run at least once (Section 6.12.1) | "run at least once" |
| **Pass Rate** | %, or "—" | Pass rate of the runs completed in the last 30 days | "last 30 days" |
| **Active Runs** | count | Executions whose status is In Progress | "executions in progress" |
| **Open Bugs** | count | Bugs that are Open or In Progress | "open + in progress" |
| **Critical Bugs** | count | Open bugs whose severity is Critical | "open critical" |

Each tile with a derived value has an info tooltip that explains it in plain words. The Health Score tooltip lists its four components and their weights.

**Health Score definition:**
The Health Score is a number from 0 to 100 that combines four components:

| Component | Weight | How it is measured |
|---|---|---|
| Pass rate | 40% | Pass rate over the last 30 days |
| Coverage | 20% | Percentage of test cases that have been run at least once |
| Bug pressure | 25% | 100 minus a penalty for each open bug (25 points per Critical, 10 per High, 3 per Medium; Low bugs carry no penalty), never below 0 |
| Freshness | 15% | Percentage of Ready test cases that have been run in the last 14 days |

Status labels: **Healthy** 80–100, **At Risk** 60–79, **Critical** below 60. A project with no runs yet shows "No data" instead of a score. A project with runs, but none in the last 30 days, scores 0 for the pass-rate component. A project with no Ready test cases scores 0 for freshness.

**Charts (all selectable time ranges: 7, 15, 30, or 90 days; each chart keeps its own range, default 30):**
- **Health Score trend:** a line chart of the score as it stood at the end of each day of the range. Each day is computed from the record as of that day:
  - the pass rate over the 30 days ending that day
  - coverage, from the test cases that existed and the runs completed by that day
  - bug pressure, from the bugs that were open at the end of that day: reported by then, and not yet resolved by their resolution date
  - freshness, from the test cases that were Ready that day and the runs completed in the 14 days before it

  Days before the project's first completed run have no score and are left off the line.
- **Pass Rate trend:** a line chart of each day's pass rate, over the runs completed that day. A day with no completed runs shows 0%, as the chart's tooltip explains (Section 6.12.2).
- **Bug Velocity:** a line chart with two series, **Reported** (bugs reported that day) and **Resolved** (bugs whose resolution date falls on that day), so the team can see whether the backlog is growing.
- **Run Outcomes donut:** the split of Pass, Fail and Needs Review over the runs completed in the last 30 days. It has a fixed 30-day range, the total in the centre, and each count with its percentage in the legend. Empty state: "No completed runs yet."

**Panels:**
- **Top Failing Tests:** up to 6 test cases with the highest fail rate over all their completed runs. A test case needs at least 3 completed runs and a fail rate above 0 to appear.
  - Sorted by fail rate, then by number of failures.
  - The rate is shown red at 75% or more and amber at 40% or more.
  - Each row reads "X of Y runs failed" and opens the test case in a new tab.
  - Empty state: "No failing tests — nice!", with a check mark.
- **Urgent Bugs:** up to 6 open bugs of Critical or High severity, Critical first, then the most recently reported.
  - Each row shows a severity badge, the title, and "<status> · opened <relative time>" (for example "Open · opened 3d ago").
  - Each row opens the bug in a new tab.
  - Empty state: "No critical or high open bugs."
- **Recent History:** the 10 most recent activity events, on a vertical timeline. Each shows the actor's avatar initials, the action as a sentence coloured by its kind, the entity's icon and a relative time ("just now", "5m ago", "3h ago", "2d ago", then the date). Entries use the same wording as the Activity screen (Section 6.6). A **Full History** link opens a dialog with the project's complete feed, which loads older entries on demand.

**User Actions:**
- Adjust the time range for any chart independently.
- Click items in the Top Failing Tests or Urgent Bugs panels to navigate.
- Open the full activity history dialog.
- Download the dashboard as a PDF report, which reflects the selected ranges (Section 8). The button reads "Generating…" until the file is ready.

---

### 6.2 Test Cases

**Purpose:** The authoring and management hub for all test cases, organised into a browsable folder hierarchy.

#### 6.2.1 Layout
The screen is split into two panels:
- **Left panel:** A folder tree showing all folders and their contained test cases.
- **Right panel:** Either a folder summary or a test case detail view, depending on what is selected.

#### 6.2.2 Folder Tree
- Folders are expandable and collapsible by clicking.
- Each test case in the tree shows a small coloured dot indicating its last run outcome (or no dot if it has never been run).
- A filter panel is available to narrow the tree by name, status, or tags.
- A Dashboard view toggle switches the right panel to an aggregate statistics view across all test cases.

#### 6.2.3 Test Case Detail View
When a test case is selected, the right panel shows:
- **Breadcrumb path** through the folder hierarchy.
- **Name** (editable inline by Contributors).
- **Status badge** (Draft, Ready, or Deprecated).
- **Source type badge** (Gherkin or Manual).
- **Tags** (editable inline by Contributors).
- **Health banners** — contextual alerts surfaced automatically:
  - *Orphan:* This test case has never been added to any execution.
  - *Never Run:* It has been added to an execution but never actually executed.
  - *Dormant:* Its last run was more than 14 days ago.
  - *Degrading:* Its pass rate over its last 5 runs is at least 20 percentage points lower than over the 5 runs before them (requires at least 10 runs).
  - *Improving:* The same comparison, at least 20 percentage points higher.
  - *Trend Reset:* The Gherkin script was edited recently; runs before the edit are excluded from the Degrading/Improving comparison until enough new runs accumulate (10 runs completed after the edit; ADR 0025).
- **Gherkin script editor** — A plain text area for the scenario script; saves automatically when the user clicks away.
- **Run history table** — The last 10 runs showing execution name, outcome, AI confidence %, duration, and date. A link to the full history is available.
- **Run button** with a dropdown offering two options: (a) create a brand-new execution containing this test case, or (b) add it to an existing execution.

#### 6.2.4 Test Cases Dashboard View
Aggregate statistics across the project's test cases, using the shared definitions in Section 6.12.

**Entry and states:**
- The dashboard is the default right-panel view: it shows when nothing is selected. Selecting a folder still shows that folder's summary (Section 6.2.1), and selecting a test case, or opening an address that links to one, shows its detail. The Dashboard toggle returns to the dashboard from either (ADR 0025).
- While loading, it shows a title placeholder and four tile placeholders.
- With no test cases, it shows an empty state: "No test cases yet" with the hint "Create test cases to start seeing metrics". There is no download button.

**Layout (top to bottom):** stat tiles → two trend charts → two donuts → Needs Attention table → a 2 × 2 grid of rankings → Folder Health table → the collapsible History panel.

**Stat tiles:**

| Tile | Value | Sub-label |
|---|---|---|
| **Total Tests** | count of test cases | "N ready" |
| **Ready** | Ready ÷ total, as % | "N of M cases" |
| **Coverage** | test cases with at least one completed run ÷ total, as % (the same definition as the Overview) | "N never run" |
| **Avg Confidence** | the mean AI confidence of each test case's latest completed automated run, as %, or "—" | "from last run results" |

**Charts:**

| Chart | Type | What it shows |
|---|---|---|
| **Test Cases Over Time** | line chart, 3 series, own range | Per day: test cases **created**; runs **added** to executions; runs **completed** |
| **Pass Rate Trend** | line chart, own range | Per day: the pass rate of the runs completed that day. Shown only once the project has at least one completed run; until then, Test Cases Over Time takes the full width. |
| **Last Run Outcome** | donut | Test cases by the outcome of their latest completed run: Pass, Fail, Needs Review, and Never Run for those with none |
| **Source Type** | donut | Test cases by source type: Gherkin or Manual |

**Needs Attention table:** lists every test case with at least one issue (Section 6.12.1):

| Issue | Rule | Badge |
|---|---|---|
| No Script | The test case has no Gherkin script | amber |
| Orphan | Never added to any execution | amber |
| Never Run | Added to an execution, but no completed run yet | amber |
| Dormant | Its last completed run was more than 14 days ago | amber |
| Degrading | As defined for the Degrading health banner | red |

- The heading shows a count and an info tooltip that defines each badge.
- A name filter narrows the rows as the user types.
- Sortable columns: Test Case (with its tags), Issue, Status, Created and Last Updated: the last change to its name, script, status or tags, or a move. The default sort is Created, oldest first.
- The first 10 rows show, then a "Show N more" control.
- A row opens the test case in a new tab.

**Rankings (2 × 2 grid, top 10 each):**

| Ranking | Includes | Value shown |
|---|---|---|
| **Most Run Test Cases** | Test cases with at least one completed run, most first | number of completed runs |
| **Top Failing Test Cases** | Test cases with at least 3 completed runs and at least one Fail, highest fail rate first | the fail rate in red, then "(failed/completed)" |
| **Top Flaky Test Cases** | Test cases with at least one flaky run (Section 6.12.1) | flaky runs ÷ completed runs, in amber, then "(flaky/completed)" |
| **Top Tags** | Tags by how many test cases carry them | the tag and its count. Not clickable. |

Every row shows its rank and the name. In the first three rankings, a row opens the test case in a new tab. Each ranking has its own empty-state line.

**Folder Health table:** one row per folder that directly holds test cases, sorted by issue rate, highest first.
- **Folder:** the full path, joined with " / ".
- **Cases:** how many test cases it holds directly.
- **Issues:** how many of them have at least one issue, and the percentage. Shown red at 50% or more, amber below that, and as a green "—" when none do.
- **Breakdown:** one badge per issue kind, with its count (for example "Dormant ×3").

**History panel:** the latest test case activity (Section 6.12.4).

**Download:** a PDF of this dashboard for the ranges selected on each trend chart (Section 8).

#### 6.2.5 User Actions

**Folder actions:**
- Create a new folder (via toolbar button or right-click context menu on an existing folder).
- Rename a folder (Contributors and above; inline editing).
- Delete a folder together with all its subfolders and test cases (Admins only; a confirmation shows how many items are affected, and deleted items go to the Trash, Section 2.11). Refused, with the executions listed, if any test case inside is part of a Ready, In Progress, or Paused (a Draft execution does not block deletion; see ADR 0012) execution.
- Drag folders to reorder them or move them within the hierarchy.

**Test case actions:**
- Create a new test case (via toolbar "+" button or right-click context menu on a folder).
- Select a test case to view its detail.
- Edit a test case's name inline.
- Edit the Gherkin script (auto-saves on blur).
- Run a test case (create a new execution or add to an existing one).
- Delete a test case (Admins only, via right-click menu; it goes to the Trash). Refused, with the executions listed, if the test case is part of a Ready, In Progress, or Paused (a Draft execution does not block deletion; see ADR 0012) execution.
- Drag test cases to reorder them or move them to a different folder.
- Filter the tree by name, status, or tags.
- Switch between tree view and dashboard view.

---

### 6.3 Test Executions

**Purpose:** The control centre for planning, running, and reviewing batches of test cases.

#### 6.3.1 Layout
Split into two panels:
- **Left panel:** A scrollable list of all executions.
- **Right panel:** The detail view for the selected execution.

A Dashboard view toggle switches to aggregate statistics across all executions.

#### 6.3.2 Execution List
Each entry in the list shows:
- Execution name.
- Status badge.
- Done/total run counts.
- Pass, Fail, and Needs Review counts.
- Last updated date.

Sorting options: last updated, creation date, status (ascending or descending).  
Filtering options: by name, status, environment, browser, and tags (an execution matches when it contains at least one test case carrying any of the selected tags).

#### 6.3.3 Execution Detail View
When an execution is selected, the right panel shows:

**Header area:**
- Execution name and description.
- Status badge with a live elapsed timer (it counts only while the execution is In Progress; time spent Paused is not counted).
- Metadata: app version, environment, browser, viewport size, locale, timezone. The environment entry opens a panel listing its credential aliases and emails; Contributors and Admins can reveal passwords there (Section 6.7).

**Stats bar (5 cells, each clickable to filter the runs table below):**
Total | Pass | Needs Review | Fail | Pending

**Progress bar:** colour-coded by outcome proportion.

**Test runs table:**
- Columns: position number, test case name, status, AI confidence %, duration.
- During an active automated run, the test case name cell shows a live, step-by-step progress display.
- Rows are draggable to reorder (Draft status only).
- Hovering a row reveals a link to open the test case in a new tab and (for Admins) a remove button.

**Run detail side panel:**
Slides in when a run row is clicked. Contains:
- Step-by-step results (step text, outcome, duration, error message).
- Attempt history (list of all re-runs of this run).
- Bug links (linked bugs with navigation).
- Controls: manually update the run's status, file a new bug (pre-filled from this run), link an existing bug.

**Console drawer:** A collapsible panel at the bottom showing live log output during automated runs.

**Activity history panel:** A list of changes made to this specific execution over its lifetime.

**Traceability button:** Opens a visual graph (see Section 6.3.5).

**Download buttons:** Export as HTML report or PDF report.

#### 6.3.4 Execution Lifecycle & Actions

The execution moves through the following states, with available actions at each:

| Status | Available Actions |
|---|---|
| **Draft** | Edit (opens the creation modal pre-filled), Mark as Ready, Delete (Admins only), reorder runs, remove individual runs |
| **Ready** | Back to Draft, Run All |
| **In Progress** | Pause, Cancel |
| **Paused** | Resume, Cancel |
| **Completed** | Sign Off (Admins), Try Again |
| **Done / Canceled** | Try Again |

**Run All** opens a confirmation dialog asking the user to choose execution mode:
- *Manual:* The user marks each test case outcome themselves via the side panel.
- *Automated:* An automated engine runs the test cases. Note: this mode is currently under reconstruction and is temporarily unavailable.

Run All, Pause, and Resume are available to Contributors and Project Admins; Viewers do not see them. Run All cannot start an execution that contains no test runs: the user is asked to add at least one test case first. When an execution starts, each run records the name and Gherkin script of its test case as they are at that moment.

**Cancel** (from In Progress or Paused, Contributors and Project Admins) stops the timer and ends the execution. Runs not yet run stay Pending, and no outcome can be changed afterwards.

**Try Again** (from Completed, Done or Canceled) offers:
- Duplicate the execution with a custom subset of test cases (a new Draft execution is created with the same settings; every eligible test case starts selected).
- Restart the current execution (all results are reset and the execution returns to Ready, to be re-run from scratch). Previous results are kept as the runs' attempt history, and runs whose test case was deleted are dropped. Restarting a Done execution requires a Project Admin.

#### 6.3.5 Traceability Graph
Accessible from any execution detail view. Opens a full-screen visual graph with four columns:
- Test Cases → Executions → Test Runs → Bugs

Directed edges connect related entities. Hovering a node highlights its entire lineage (all ancestors and descendants). Clicking a node navigates to that entity's detail view.

#### 6.3.6 Executions Dashboard View
Aggregate statistics across executions and their runs, using the shared definitions in Section 6.12. It is the most interactive dashboard: its charts filter the runs table below them, and the PDF export reflects every active filter.

**Entry and states:**
- The dashboard is the default right-panel view, unless the address links to a specific execution, which opens that execution's detail instead. The Dashboard toggle returns to it at any time.
- While loading, it shows placeholders, with the History panel already visible below them.
- With no executions, it shows an empty state: "No executions yet" with the hint "Create an execution to start seeing metrics". There is no download button.

**Scope follows the list filters:** the dashboard covers exactly the executions the execution list currently shows. When any list filter is on (name, status, environment, browser, tags; Section 6.3.2), a notice above the tiles names the active filters. Clearing them returns the dashboard to all executions.

**Stat tiles:**

| Tile | Value | Sub-label |
|---|---|---|
| **Executions** | count of executions in scope | "N active" (In Progress or Paused) |
| **Total Runs** | all runs of those executions | "N completed" |
| **Pass Rate** | pass rate of their completed runs | "X of Y runs", or "no results yet" |
| **Avg Duration** | the mean duration of their runs that have one, in seconds with one decimal, or "—" | "per test run" |

**Charts:**

| Chart | Type | What it shows | Clicking it |
|---|---|---|---|
| **Executions Over Time** | line chart, own range | Executions completed per day | — |
| **Runs Over Time** | stacked bars per day: Passed, Failed, Needs Review; own range | Runs completed per day, by outcome | A segment filters the runs table to that day and outcome, switching it to All Runs. Clicking the segment again clears that filter. |
| **Execution Status** | donut, parts sorted by count | Executions per status, in the execution status colours | A part sets the execution list's status filter to that status, and the whole dashboard follows |
| **Run Outcomes** | donut | Runs by current outcome: Pass, Fail, Needs Review, Pending | A part filters the runs table to that outcome and clears any day filter. Clicking it again clears it. |

Execution status colours: Draft grey, Ready green, In Progress blue, Paused amber, Completed dark green, Done muted grey, Canceled muted red.

**Runs table:** one row per run across the executions in scope.
- **Tabs:** **Needs Attention** (the default; runs whose outcome is Needs Review, with a count) and **All Runs**.
- **Filters**, applied in this order: the tab, then the outcome filter, then the day-and-outcome filter, then a name filter. The name filter matches either the test case's or the execution's name.
- **Active filter label:** the current chart filter is named next to a **Clear filter** control, for example "Pass" or "Mar 4 · Failed".
- **Columns**, all sortable:
  - Order: the run's position in its execution.
  - Test Case: the name; the failed step in red, when one was recorded; the execution's name below.
  - Outcome.
  - Attempts: how many times the run was run, including earlier attempts.
  - Bugs: bugs linked to the run, red when above 0.
  - Created.
  - Last Updated: when its current outcome was recorded.
- **Loading:** the table shows its first rows and loads more as the user scrolls, with a "N of M" counter. Changing any filter or sort starts again from the top.
- **Opening a run:** clicking a row opens that run in its execution, in a new tab.
- **Empty states:** "No runs need review." on Needs Attention, and "No runs match this filter." otherwise.

**Export:** the download button reads **Download report**, or **Download filtered report** while any dashboard filter is on (the Needs Attention tab counts as one). It opens a dialog with:
- two switches:
  - **Test Executions**: on by default, showing how many executions are in scope.
  - **Runs**: off by default. Its label follows the open tab, "Needs Attention" or "Runs".
- a notice listing the active list filters and the active runs-table filter
- **Download PDF**, disabled while both switches are off. It reads "Generating…" until the file is ready, and shows an error if the export fails.

The PDF uses the selected chart ranges and the same filtered set (Section 8).

**History panel:** a collapsible panel (Section 6.12.4) with two tabs, **Executions** and **Runs**, each showing that area's latest activity. "See full history" opens the tab that is open.

---

### 6.4 Bugs

**Purpose:** Defect tracking tightly integrated with the test execution workflow.

#### 6.4.1 Layout
Split into two panels:
- **Left panel:** A scrollable list of all bugs.
- **Right panel:** The detail view for the selected bug.

A Dashboard view toggle switches to aggregate statistics.

#### 6.4.2 Bug List
Each entry shows:
- Title.
- Severity indicator (colour-coded dot).
- Status badge.
- Tags.

Sorting options: last updated, creation date, status, severity.  
Filtering options: by name, status, severity.

#### 6.4.3 Bug Detail View
- **Title** (editable inline by Contributors).
- **Status** (changeable inline: Open → In Progress → Resolved → Closed / Won't Fix).
- **Severity** (changeable inline: Critical, High, Medium, Low).
- **Reporter name.**
- **Tags** (editable inline via a tag picker).
- **Linked test run** section: shows the run's status, date, duration, failed step, and a link to navigate to the execution.
- **Linked test case** section: shows the test case name with a link.
- **Gherkin script snapshot:** the script that was captured at the moment the bug was created, with the failed step highlighted in red.
- **Description** (free text).
- **Steps to reproduce** (free text).
- **Image attachment gallery:** up to 5 thumbnails. Clicking a thumbnail opens a full-screen lightbox viewer. Images can be removed.
- **Activity history panel:** a log of all changes to this bug.
- **Delete button** (Admins only).

#### 6.4.4 Bugs Dashboard View
Aggregate bug metrics for the project, using the shared definitions in Section 6.12.

**Entry and states:**
- The dashboard is the default right-panel view, unless the address links to a specific bug, which opens that bug's detail instead.
- A Dashboard control in the list header switches to the dashboard and clears the selected bug.
- A row in the dashboard's Needs Attention table opens that bug's detail.
- While loading, it shows a title placeholder and four tile placeholders.
- With no bugs, it shows an empty state: "No bugs yet" with the hint "Report a bug to start seeing metrics". There is no download button.

**Layout (top to bottom):**
1. A header, "Dashboard", with "Aggregate bug metrics for this project" and **Download report**.
2. Four stat tiles.
3. Two trend charts.
4. Two donuts: All Bugs by Severity and All Bugs by Status.
5. Two donuts: Open by Severity and Backlog Age.
6. Avg Resolution Time, next to the Bugs by Tag cloud.
7. The Needs Attention table, shown only when it has rows.

**Stat tiles:**

| Tile | Value | Sub-label |
|---|---|---|
| **Total Bugs** | all bugs | "N in progress" |
| **Open** | bugs whose status is Open | "needs attention" |
| **Resolved** | bugs whose status is Resolved (not Closed or Won't Fix) | "of N total" |
| **Critical (all time)** | bugs whose severity is Critical, in any status | "highest severity" |

The Critical tile counts Critical bugs of every status, unlike the Overview's Critical Bugs tile, which counts open ones only. Its label says "all time" so the two are never confused.

**Charts:**

| Chart | Type | What it shows |
|---|---|---|
| **Reported vs Resolved** | line chart, 2 series | Per day: bugs reported, and bugs resolved (by resolution date) |
| **Reported vs Resolved — Critical** | line chart, 2 series | The same, for Critical bugs only |
| **All Bugs by Severity** | donut | Bugs per severity, all statuses |
| **All Bugs by Status** | donut | Bugs per status: Open, In Progress, Resolved, Closed, Won't Fix |
| **Open by Severity** | donut | Open bugs (Open or In Progress) per severity |
| **Backlog Age** | donut, with a tooltip explaining the buckets | Open bugs by time since they were reported: under 7 days (Fresh), 7–30 days (Aging), over 30 days (Old) |

The two line charts share one range selector (7, 15, 30 or 90 days, default 30), which the PDF export also uses.

**Avg Resolution Time:**
- For each severity that has resolved bugs: the average time from reported to resolution date, rounded to whole days.
- Each row shows the severity's colour dot, its name, "Nd" and "(n bugs)".
- Empty state: "No resolved bugs yet".

**Bugs by Tag:** a word cloud of the tags used on bugs.
- Each tag is sized by how many bugs carry it. Size grows with the square root of the count, between a minimum and a maximum, and every tag is the same size when all counts are equal.
- Large and small tags are interleaved, so the large ones don't cluster.
- Each word uses its tag's colour. A tag without one gets a colour that always stays the same for that tag.
- Hovering a tag shows "name: count".
- Empty state: "No tagged bugs yet."

**Needs Attention table:** open bugs that match at least one rule:
- **Idle** (amber badge): no update for 30 days or more.
- **Unattended** (red badge): Critical or High severity, and still in Open status.

Rows are sorted Unattended first, then by severity (Critical first), then by the longest time since the last update. The heading shows a count and an info tooltip that defines both badges. Columns: Bug (the title, truncated when long), Issue (the badges), Severity (colour dot and name) and Status.

**Download:** a PDF of this dashboard for the selected range (Section 8).

---

### 6.5 Test Automations

**Purpose:** A view of test cases that have been successfully run by the automated engine, intended as a source for generating automation artefacts.

**Content:**
- A table listing all test cases whose last automated run resulted in a Pass.
- Columns: test case name, folder, AI confidence score, last run date.
- Row-level and bulk checkboxes for selection.
- A "Generate Code" button appears when one or more items are selected.

> **Note:** The code generation feature is currently under reconstruction. Clicking the button displays a "being rebuilt" notice rather than generating output. Once rebuilt, this feature will produce downloadable automation script files that can be previewed in a file-tab panel on the right side of the screen.

---

### 6.6 Activity

**Purpose:** A full, filterable, paginated audit trail for the active project.

**Content:**
- A chronological feed of all activity events, grouped by day (Today, Yesterday, named weekdays for the current week, then by date).
- Each event shows: user avatar (initials), who did the action, the action description (colour-coded by action type), entity type icon, and relative timestamp.

**Filter pills (row at the top):**
All | Test Cases | Executions | Runs | Bugs | Folders | Environments | Projects | Tags

Event categories: invitations (sent, accepted, declined, revoked) and membership or role changes appear under Projects; revealing environment credentials appears under Environments; deleting or restoring an item appears under that item's own type.

**User Actions:**
- Click a filter pill to narrow the feed to a specific entity type.
- Click "Load more" at the bottom to fetch older entries (paginated).

---

### 6.7 Project Settings

**Purpose:** Configuration for the active project. Accessible to Project Admins and Workspace Owners only.

**Sections:**

**General**
- Edit the project name (saved immediately).
- View the project slug (read-only; set once at creation and never changed).

**Environments**
- View the list of environments attached to the project with their name and base URL.
- Edit an environment (opens the environment editor modal): name, base URL, default browser, and credentials (each with alias, email, password).
- Delete an environment.
- Add a new environment (same modal).

**Execution Defaults**
- Toggle headless mode default (saved). Determines whether executions default to running the browser invisibly.
- Set execution timeout in milliseconds (not yet persisted).
- Set screenshot policy (On Failure / All Steps / Never; not yet persisted).

**Integrations** *(placeholder, not yet functional)*
- Fields for an Atlassian/Jira workspace URL and API token.
- Fields for a GitHub/GitLab repository URL and token.

**AI / LLM Configuration** *(placeholder, not yet functional)*
- AI provider selector (multiple providers available).
- Model selector (changes based on provider).
- API key input.

**Project Context** *(placeholder, not yet functional)*
- A free-text description of the project, intended to provide context to AI-assisted features.

**Handling of stored secrets**
- *Environment credentials:* passwords are always masked. Contributors and Admins can reveal a password on demand (Admins in the environment editor; Contributors and Admins in the environment panel of an execution). Every reveal is recorded in the Activity log. Viewers see only the alias and email.
- *Integration tokens and AI/LLM API keys:* write-only. After saving, the field shows only that a value is set; Project Admins can replace it, but it can never be viewed again.
- Stored secrets never appear in reports or exports (Section 8).

---

### 6.8 Project Members

**Purpose:** Manage who has access to the active project and at what role level. Accessible to Project Admins and Workspace Owners.

**Content:**
- A table of all project members showing: display name, email, project role.
- For Admins: each row has a role picker (to promote or demote the member) and a remove button.
- An invite form at the top of the page with an email field and a role selector. Submitting this sends an invitation (Section 3.3); the person joins only after accepting.
- A list of pending invitations (email, role, date sent, expiry date), with Resend and Revoke actions for Admins.

---

### 6.9 Workspace Settings

**Purpose:** Workspace-wide administration. Accessible to Workspace Owners only.

**Sections:**

**Workspace Name**
- Displayed at the top; editable inline by Owners only.

**Projects**
- A list of all projects in the workspace, each showing: project name, test case count, execution count.
- Each project has links to manage its members and edit its settings.
- Workspace Owners see a "New Project" button that opens the project creation flow.
- Owners can delete a project. It moves to the Trash for 30 days (Section 2.11).
- A "Recently deleted" list shows deleted projects with a Restore action until they are permanently removed.

**Members** *(Owners only)*
- A list of the workspace's members with their name, email, and the projects they belong to.
- Owners can remove a Collaborator from the workspace, which removes them from all of its projects (Section 3.3).
- The Owner cannot leave the workspace until ownership has been transferred.

**Transfer Ownership** *(Owners only)*
- Enter the email of an existing workspace member (a Collaborator), confirm the action with a checkbox, and submit. An email that does not belong to a current member is rejected, so a transfer never adds anyone to the workspace. This permanently transfers workspace ownership to the specified member.
- After the transfer, the previous Owner becomes a Collaborator and keeps the Project Admin role on every project that exists at the time of transfer, so they are not locked out of ongoing work. These become ordinary project memberships that Project Admins can change or remove. They do not receive access to projects created later.

---

### 6.10 User Profile

**Purpose:** Personal account settings for the signed-in user.

**Content & Actions:**
- **Display name:** Editable inline.
- **Email address:** Shown as read-only (cannot be changed). Shows whether the address has been verified, with a "Resend verification email" option if not.
- **Appearance toggle:** Switch between dark and light mode.
- **Change password form:** Requires the current password, a new password, and a confirmation field. Errors surface inline.

### 6.11 Trash

**Purpose:** Recover deleted items. Accessible to Project Admins and Workspace Owners.

**Content:**
- A list of the project's deleted test cases, folders, executions, and bugs, showing item type, name, who deleted it, when, and how many days remain before permanent removal.
- A filter by item type.

**User Actions:**
- Restore an item to where it was. Restoring an item whose containing folder is also in the trash restores that folder as well.
- Items are removed permanently and automatically after 30 days.
- Deleted projects are restored from Workspace Settings (Section 6.9), not from this screen.

---

### 6.12 Dashboard Metrics & Conventions

**Purpose:** One set of definitions shared by the four dashboards: the Overview (Section 6.1) and the Test Cases, Executions and Bugs dashboard views (Sections 6.2.4, 6.3.6, 6.4.4). Every number in this section means the same thing wherever it appears, on screen and in the dashboard PDFs (Section 8).

#### 6.12.1 What is counted
- **Scope:** every dashboard covers the active project only. Items in the Trash are excluded (Section 2.11): deleted test cases, folders and bugs, and the runs of deleted executions.
- **Runs counted:** each run's current outcome. Outcomes from an execution's earlier attempts (kept as attempt history after a Restart, Section 6.3.4) are *stale* and are never counted in any rate, count or chart.
- **Completed run:** a run whose outcome is Pass, Fail or Needs Review. A Pending run is not completed. A run's completion time is the moment its current outcome was recorded.
- **Pass rate:** Pass ÷ (Pass + Fail + Needs Review), over the completed runs in the period. With no completed runs in the period, the pass rate is "no data", shown as "—".
- **Fail rate:** Fail ÷ (Pass + Fail + Needs Review), over the same runs.
- **Coverage:** the share of the project's test cases that have at least one completed run, at any time.
- **Flaky run:** a run whose current outcome is Pass, while an earlier attempt of the same execution recorded Fail or Needs Review for it.
- **Open bug:** a bug whose status is Open or In Progress.
- **Resolved bug:** a bug whose status is Resolved, Closed or Won't Fix. A bug's resolution date is the moment it entered one of those statuses (Section 2.9). It is not affected by later edits, such as a title change.
- **Test case issues:** the No Script, Orphan, Never Run, Dormant and Degrading flags. These are the same rules as the test case health banners (Section 6.2.3); No Script means the test case has no Gherkin script.
- **Automation-only figures:** AI confidence and run duration only exist for automated runs (Section 9). Until there are any, widgets built on them show "—".

#### 6.12.2 Time ranges and trends
- Every trend chart has its own range selector: 7, 15, 30 or 90 days, default 30. Changing one chart's range never changes another's.
- A range ends today and counts whole calendar days, in the viewer's time zone. The Health Score trend is the one exception: its days are UTC days, because each day's score is recorded once for everyone (ADR 0024).
- A trend chart has one point per day in the range. A day with no data shows 0. For rate series such as pass rate, the chart's info tooltip says that days with no runs are drawn as 0.
- Hovering a chart shows the values for the nearest day. In a chart with several series, the legend can hide or show each series.
- A PDF export uses exactly the ranges selected on screen, 15 days included.

#### 6.12.3 Thresholds
These are fixed, project-wide values. Dormant and Degrading are intended to become configurable per project in Project Settings (Section 6.7). The others stay fixed.

| Threshold | Value | Used by |
|---|---|---|
| Health Score bands | Healthy 80–100, At Risk 60–79, Critical below 60 | Overview |
| Dormant | last completed run more than 14 days ago | Test case banners, Test Cases dashboard |
| Degrading | pass rate over the last 5 runs at least 20 percentage points below the 5 before them (needs 10 runs) | Test case banners, Test Cases dashboard |
| Minimum runs to rank a failing test | 3 completed runs | Overview, Test Cases dashboard |
| Fail-rate emphasis | 75% or more red, 40% or more amber | Overview, Test Cases dashboard |
| Idle bug | no update for 30 days or more | Bugs dashboard |
| Backlog age buckets | under 7 days, 7–30 days, over 30 days | Bugs dashboard |
| Folder issue emphasis | 50% or more of its test cases with an issue red, otherwise amber | Test Cases dashboard |

#### 6.12.4 Common building blocks
- **Stat tile:** an icon, a short uppercase label, an info tooltip for any figure whose meaning isn't obvious, a large value and a one-line sub-label. The Overview's tiles also change colour by status where the tile defines one.
- **Section card:** a titled panel holding one chart, list or table.
- **Charts:** line charts for trends, stacked bars for daily outcome counts, donuts for parts of a whole, and a word cloud for tag usage. A donut shows its total in the centre and a legend with each part's count and percentage. Parts with a count of 0 are hidden.
- **Loading:** every tile and widget shows a placeholder shaped like its content until its data arrives.
- **Empty states:**
  - When a dashboard has nothing to show at all (no test cases, executions or bugs yet), it shows one large empty state with a hint on how to start, and no download button.
  - An individual widget with no data shows one short line in its place, for example "No completed runs yet.".
- **Ranked lists:** each row has a rank number, the item's name (truncated when long) and a right-aligned value. A row opens the item in a new tab. The Overview's lists show at most 6 rows, the dashboard views' at most 10.
- **Colours:** each outcome, execution status, bug status and severity has one colour, used the same way on every dashboard, list and badge:
  - Pass, Resolved and Fresh are green.
  - Fail, Critical, Reported and Old are red.
  - Needs Review, Medium and Aging are amber or yellow.
  - High is orange.
  - In Progress, Low and Manual are blue.
  - Gherkin and "added to an execution" are violet.
  - Pending, Never Run and Done are muted grey.
- **History panel:** the Test Cases and Executions dashboard views end with a collapsible panel showing the latest 5 activity entries for that area. It is collapsed by default, with a count badge ("5+" when there are more) and a "See full history" link that opens the paged full history. The entries read as on the Activity screen (Section 6.6).
- **Freshness:** opening a dashboard, or switching to a dashboard view, always shows current data. Dashboards don't need to update live while open.
- **Access:** every project member (Viewer and above) can see every dashboard and download its PDF. Nobody can see, or export, the dashboard of a project they have no access to. Downloading a dashboard PDF is recorded in the Activity log.

---

## 7. Creation Flows

### 7.1 New Test Case Flow

1. Click the "+" button in the Test Cases toolbar, or use the right-click context menu on a folder.
2. The **New Test Case** modal opens.
3. The user selects a destination folder from a tree picker.
4. The user enters a name for the test case.
5. The user may optionally write a Gherkin script directly in the modal.
6. Clicking Save creates the test case and opens it in the detail view.

> A "Generate from Sources" mode is scaffolded in the UI where the user would provide URLs or upload files and select an exhaustiveness level for AI-generated test scenarios. This mode is currently disabled.

---

### 7.2 New Execution Flow

1. Click the "+" button in the Test Executions toolbar, or use the Run button on a test case.
2. The **New Execution** modal opens.
3. The user configures:
   - **Name** (required)
   - **Description** (optional)
   - **Test case selection** using the folder tree picker (one or more test cases)
   - **Environment** (select from the project's environments, or leave unset)
   - **Browser** (Chromium, Firefox, or WebKit)
   - **Auto-create bug on failure** toggle
   - **Viewport preset** (common screen sizes, or custom width × height)
   - **Locale** (e.g. English US, Japanese, Portuguese Brazil)
   - **Timezone** (e.g. America/New_York, Europe/Paris, Asia/Tokyo)
4. Clicking Save creates the execution in **Draft** status.
5. The user reviews and optionally reorders the runs list.
6. The user clicks **Mark as Ready**, then **Run All** to start execution.
7. A mode confirmation dialog is presented (Manual or Automated — see Section 6.3.4).

---

### 7.3 New Bug Flow (Manual)

1. Click the "+" button in the Bugs toolbar, or click "File Bug" in a run detail side panel.
2. The **New Bug** modal opens.
3. The user fills in:
   - **Title** (required)
   - **Description** (optional)
   - **Steps to reproduce** (optional)
   - **Severity** (Critical, High, Medium, Low)
   - **Tags** (optional)
   - **Image attachments** (up to 5 files, JPEG/PNG/WebP/GIF, up to 5 MB each)
4. If opened from a run detail panel, the title and Gherkin snapshot are pre-filled.
5. Clicking Save creates the bug and adds it to the bug list.

---

### 7.4 Automatic Bug Creation

When an execution has **Auto-create bug on failure** enabled, the system automatically creates a bug report for each failing run. The bug is pre-populated with:
- The test case name as the title.
- The Gherkin script snapshot.
- The specific failed step highlighted.

---

### 7.5 New Project Flow (Workspace Owners only)

1. Click "New Project" on the Workspace Settings screen.
2. A multi-section form is presented (identical to the Edit Project page).
3. At minimum, the user provides a project name.
4. Environments can be added during creation or later via Project Settings.
5. Saving creates the project and adds the Owner as a Project Admin automatically.

---

## 8. Reporting & Exports

The platform provides downloadable reports at multiple levels:

| Report | Source | Format | Contents |
|---|---|---|---|
| **Execution HTML Report** | Execution detail view | Standalone HTML file | Execution metadata, all test runs with step-by-step results, Gherkin scripts, linked bugs, and image attachments embedded in the file (no internet connection required to view) |
| **Execution PDF Report** | Execution detail view | PDF | Same data as the HTML report, in a print-ready format |
| **Overview Dashboard PDF** | Overview screen | PDF | Everything on the Overview: the KPI tiles, the trend charts for the ranges selected on screen, the Run Outcomes split, Top Failing Tests, Urgent Bugs and recent history |
| **Test Cases Dashboard PDF** | Test Cases dashboard view | PDF | The stat tiles, both trend charts for their selected ranges, the donuts, the Needs Attention table, the rankings and Folder Health |
| **Executions Dashboard PDF** | Executions dashboard view | PDF | The executions in scope (the list filters), the stat tiles and charts for their selected ranges, and, when chosen in the export dialog, the executions and the runs matching the runs-table filter, each with the active filters named |
| **Bugs Dashboard PDF** | Bugs dashboard view | PDF | The stat tiles, both Reported vs Resolved charts for the selected range, the donuts, Avg Resolution Time, the tag counts and the Needs Attention table |

Reports are generated in the background: the user sees a "generating" state and is notified, with a download link, when the file is ready.

No report or export ever contains stored credentials, tokens, or API keys.

A dashboard PDF always shows the same numbers as the screen it was downloaded from: the same definitions (Section 6.12), ranges and filters. Downloading a report is recorded in the Activity log.

---

## 9. In-Progress / Roadmap Features

The following features are partially scaffolded in the UI but are not yet fully functional. They represent committed product direction for near-future releases.

| Feature | Current State | Description |
|---|---|---|
| **Automated execution engine** | Disabled (rebuilt from scratch) | Runs Gherkin test cases automatically using a Playwright-backed engine with AI-assisted step mapping. Users see a "being rebuilt" notice when attempting to use it. Once complete, the "Run All → Automated" path will be restored. |
| **Test case generation from sources** | UI scaffold visible but disabled | Allows users to provide documentation URLs or uploaded files, choose an exhaustiveness level, and have the system generate draft Gherkin test cases automatically. |
| **Playwright code generation** | UI visible but disabled | From the Test Automations screen, generates downloadable Playwright spec files for passing, high-confidence test cases. |
| **Integration with issue trackers** | Placeholder fields in Project Settings | Jira and GitHub/GitLab integration for syncing bugs and test results. |
| **AI/LLM configuration** | Placeholder fields in Project Settings | Per-project configuration of AI provider and model for all AI-assisted features. |
| **Screenshot policy & execution timeout settings** | Fields visible but not yet persisted | Additional execution configuration options. |
| **Project context for AI** | Field visible but not yet persisted | A free-text description of the project fed as context to AI features. |

---

## 10. Key User Journeys

### 10.1 Onboarding a New Team
1. One person signs up, creating the workspace.
2. They are guided through the onboarding steps: create a test case → set up an environment → run an execution.
3. They invite teammates by navigating to Project Members and entering their emails.
4. Teammates receive an invitation by email. Existing users also see it in their workspace switcher; new users sign up through the email link. Each person accepts the invitation to join.

### 10.2 Writing and Organising Test Cases
1. A Contributor creates folders in the folder tree to reflect the feature areas of the application.
2. They create test cases within each folder, writing Gherkin scripts or leaving them as manual descriptions.
3. They apply tags for cross-cutting concerns (e.g. "smoke", "regression").
4. They can drag and drop test cases and folders to reorganise at any time.

### 10.3 Running a Test Suite
1. A Contributor creates a new execution, selects the relevant test cases, chooses the environment and browser, and saves.
2. The execution is reviewed in Draft, then marked as Ready.
3. The team runs manually: each person opens a run, performs the test, and updates the outcome.
4. Failing runs trigger bug reports (manually or automatically).
5. Once all runs have outcomes, a Project Admin signs off the execution.

### 10.4 Investigating a Bug
1. A team member notices a failing run and clicks "File Bug" from the run side panel.
2. The bug is created pre-filled with the Gherkin script and failed step.
3. They add a description and screenshots.
4. A developer takes ownership by changing the status to "In Progress".
5. Once fixed, they mark it "Resolved".
6. A tester re-runs the test and, if it passes, marks the bug "Closed".

### 10.5 Reviewing Project Health
1. A manager opens the Overview Dashboard.
2. They review the Health Score and trend charts.
3. They spot more bugs reported than resolved in the Bug Velocity chart and click into the Urgent Bugs panel.
4. They click a critical bug to open its detail and see which test case surfaced it.
5. They use the traceability graph to follow the chain from bug → run → execution → test case.
6. They download the Overview Dashboard PDF to share with stakeholders.

---

*End of Document*
