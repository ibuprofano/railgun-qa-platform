# Spec Delta

## Purpose

The web Activity screen (PRD §6.6): a filterable, paged audit trail of everything done in the active project, readable by every project member.

## ADDED Requirements

### Requirement: The Activity screen shows the project's feed grouped by day
The web app SHALL offer an Activity screen for the active project to every member with at least Viewer access. It SHALL list the project's activity newest first, under day headings in the viewer's local time: "Today", "Yesterday", the weekday name for earlier days of the current week, then the date.

#### Scenario: Entries across several days
- **WHEN** a member opens Activity on a Thursday, in a project with entries from that day, Wednesday, Monday and two weeks earlier
- **THEN** the entries appear under "Today", "Yesterday", "Monday" and that earlier date, newest first within each

#### Scenario: An empty project
- **WHEN** a member opens Activity in a project with no entries
- **THEN** an empty state says there is no activity yet

### Requirement: Each activity entry reads as a sentence with who, what and when
Each entry SHALL show the actor's initials and name, or "System" for automatic actions, then the action as a sentence, an icon for the entity type and the relative time. Hovering the time SHALL show the exact time. The sentence SHALL be coloured by kind of action (creations and restores, deletions and removals, other changes), and the words SHALL carry the meaning without the colour.

#### Scenario: A person's action
- **WHEN** Ana set a run "Login" to Fail five minutes ago
- **THEN** the entry shows "AN", "Ana", "set run “Login” to Fail", a run icon and "5 minutes ago"

#### Scenario: A system action
- **WHEN** the purge permanently removed a bug
- **THEN** the entry shows "System" as the actor and is coloured as a removal

#### Scenario: An action the web app doesn't know yet
- **WHEN** the feed holds an entry with an action code the web app has no sentence for
- **THEN** the entry still shows, using the code and the item's name

### Requirement: Filter pills narrow the feed to one entity type
The screen SHALL show the pills All, Test Cases, Executions, Runs, Bugs, Folders, Environments, Projects and Tags, with All selected by default. Selecting a pill SHALL show only that type's entries and mark the pill as selected. The selection SHALL be kept in the page address, so a reload or shared link opens the same filter.

#### Scenario: Filtering to bugs
- **WHEN** a member selects the Bugs pill
- **THEN** only bug entries are listed and the Bugs pill is marked as selected

#### Scenario: Reloading keeps the filter
- **WHEN** a member reloads the Activity screen with the Runs pill selected
- **THEN** the Runs pill is still selected and only run entries are listed

#### Scenario: A filter with no entries
- **WHEN** a member selects Tags in a project with no tag activity
- **THEN** an empty state says there is no activity of that type

### Requirement: Older entries load on demand
The screen SHALL first show the 20 newest entries for the selected filter, and a "Load more" button while older entries exist. Pressing it SHALL append the next older entries under their day headings. The button SHALL not be shown once the oldest entry is listed. If loading fails, the screen SHALL show an error with a way to retry.

#### Scenario: Loading more
- **WHEN** a member presses "Load more" in a project with 25 entries
- **THEN** the 5 oldest entries are added below the first 20 and the button disappears

#### Scenario: Loading fails
- **WHEN** the feed cannot be loaded
- **THEN** an error state with a Retry action is shown instead of the list
