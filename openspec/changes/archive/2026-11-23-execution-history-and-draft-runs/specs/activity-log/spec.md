## ADDED Requirements

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
