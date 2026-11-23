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
