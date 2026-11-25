# activity-log Specification

## Purpose

An append-only, tamper-resistant record of actions taken in a project or workspace, readable long after the entities or users it describes are gone.

## Requirements

### Requirement: Entries are written in the same transaction as the change they record
The system SHALL write an activity entry in the same database transaction as the change it records, so the entry exists if and only if the change committed.

#### Scenario: Rolled-back transaction leaves no entry
- **WHEN** a transaction that calls the activity logger is rolled back
- **THEN** no activity entry from that call exists afterward

#### Scenario: Committed transaction leaves exactly one entry
- **WHEN** a transaction that calls the activity logger commits
- **THEN** exactly one corresponding activity entry exists

### Requirement: Entries are immutable once written
The system SHALL reject any attempt to modify or delete an activity entry, except through a reserved break-glass role.

#### Scenario: The application role cannot modify an entry
- **WHEN** the application's own database role attempts to update or delete an activity entry
- **THEN** the attempt fails

#### Scenario: The break-glass role is the sole exception
- **WHEN** the reserved break-glass role attempts to update an activity entry
- **THEN** the attempt is permitted, unlike every other role

### Requirement: Entries carry no foreign keys to what they describe
The system SHALL store a name snapshot on each activity entry and reference no entity or user table by foreign key, so later changes to — or deletion of — the thing an entry describes never alter or remove the entry.

#### Scenario: Deleting the described entity leaves its entry unchanged
- **WHEN** the entity an activity entry describes is later deleted
- **THEN** the activity entry still exists, unchanged, showing its original name snapshot

### Requirement: Entries are retrievable by keyset pagination, newest first
The system SHALL support fetching a workspace's (optionally project-scoped) activity entries ordered by creation time descending, using keyset pagination rather than offset pagination.

#### Scenario: Paging past a cursor returns only older entries
- **WHEN** a caller requests entries older than a given cursor for a workspace
- **THEN** only entries created before that cursor are returned, in descending order

### Requirement: An execution's history lists its own, its runs' and its bugs' entries
The system SHALL let a caller with at least `Viewer` access read an execution's history:
- the entries whose entity is the execution
- the run entries that name the execution
- every entry of each bug currently linked to one of its runs

Each entry SHALL report its actor's name, action, entity type, id and name, details and time. A deleted or another workspace's execution SHALL return HTTP 404.

#### Scenario: Lifecycle, outcome and bug entries together
- **WHEN** a Viewer reads the history of an execution that was started, had a run set to Fail with a bug auto-created, and was then canceled
- **THEN** the entries for the start, the outcome, the bug's creation and the cancel are all returned

#### Scenario: Later edits of a linked bug are included
- **WHEN** a bug linked to one of the execution's runs has its status changed on the Bugs screen
- **THEN** that status change appears in the execution's history

#### Scenario: Another execution's entries are excluded
- **WHEN** a Viewer reads an execution's history in a project with a second execution that also has activity
- **THEN** none of the second execution's entries, or its runs' or bugs' entries, are returned

#### Scenario: A caller with no access is refused
- **WHEN** a caller with no effective access to the project reads an execution's history
- **THEN** the request is denied with HTTP 403

#### Scenario: History is tenant-isolated
- **WHEN** a caller reads the history of an execution that belongs to another workspace through their own project's route
- **THEN** the request returns HTTP 404

### Requirement: A bug's history lists its own entries
The system SHALL let a caller with at least `Viewer` access read the entries whose entity is a given bug. A deleted or another workspace's bug SHALL return HTTP 404.

#### Scenario: A bug's history
- **WHEN** a Viewer reads the history of a bug that was filed, had its severity changed, and was linked to a run
- **THEN** exactly those three entries are returned, newest first

### Requirement: Item histories are paged newest first
Execution and bug histories SHALL be returned newest first, at most 20 entries per request. Each response SHALL include a cursor for the next, older page, or none when no older entries exist. A request with that cursor SHALL return only older entries.

#### Scenario: Loading more
- **WHEN** a Viewer reads an execution history of 25 entries, then requests the next page with the returned cursor
- **THEN** the first response has the 20 newest entries and a cursor, and the second has the 5 oldest and no cursor

#### Scenario: An invalid cursor is rejected
- **WHEN** a caller passes a malformed cursor
- **THEN** the request is rejected with HTTP 400

### Requirement: A project's activity feed lists all of its entries
The system SHALL let a caller with at least `Viewer` access read every activity entry of a project, newest first, in the same shape as the item histories. Entries of other projects, and workspace entries that belong to no project, SHALL be excluded. A caller with no access to the project, including a member of another workspace, SHALL get HTTP 403.

#### Scenario: Entries from every part of the project
- **WHEN** a Viewer reads the feed of a project where a test case was created, an execution started and a bug filed
- **THEN** all three entries are returned, newest first

#### Scenario: Workspace and other-project entries are excluded
- **WHEN** a Viewer reads a project's feed after the workspace was renamed and a second project had a test case created
- **THEN** neither of those entries is returned

#### Scenario: System entries have no actor
- **WHEN** the purge has removed a bug from the project's trash
- **THEN** the feed includes the purge entry with no actor name

#### Scenario: A caller with no access is refused
- **WHEN** a caller with no effective access to the project reads its feed
- **THEN** the request is denied with HTTP 403

#### Scenario: Another workspace's member is refused
- **WHEN** a member of another workspace reads the project's feed
- **THEN** the request is denied with HTTP 403 and no entries are returned

### Requirement: The project feed can be filtered by entity type
The feed SHALL accept an optional type matching the Activity screen's filters, and return only that type's entries:
- test cases, executions, runs, bugs, folders, tags
- environments, including password reveals
- projects

Deleting, restoring and purging an item SHALL count under the item's own type. An unknown type SHALL be rejected with HTTP 400.

#### Scenario: Only runs
- **WHEN** a Viewer reads the feed filtered to runs, in a project where an execution was started and two runs got outcomes
- **THEN** only the two outcome entries are returned

#### Scenario: Password reveals count as environments
- **WHEN** a Viewer reads the feed filtered to environments after an environment was edited and a password revealed
- **THEN** both entries are returned

#### Scenario: A restore counts as its item's type
- **WHEN** a Viewer reads the feed filtered to folders after a folder was deleted and then restored
- **THEN** both the deletion and the restore entries are returned

#### Scenario: Unknown type
- **WHEN** a caller filters the feed by an unknown type
- **THEN** the request is rejected with HTTP 400

### Requirement: The project feed is paged newest first
The feed SHALL return at most 20 entries per request, with a cursor for the next, older page, or none when no older entries exist. A request with that cursor, and the same type filter, SHALL return only older entries. A malformed cursor SHALL be rejected with HTTP 400.

#### Scenario: Loading more
- **WHEN** a Viewer reads the feed of a project with 25 entries, then requests the next page with the returned cursor
- **THEN** the first response has the 20 newest entries and a cursor, and the second has the 5 oldest and no cursor

#### Scenario: Paging a filtered feed
- **WHEN** a Viewer pages the feed filtered to bugs
- **THEN** every page holds only bug entries, and no bug entry is skipped or repeated
