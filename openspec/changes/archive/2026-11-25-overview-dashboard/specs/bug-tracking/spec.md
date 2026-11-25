# Spec Delta

## ADDED Requirements

### Requirement: A bug records when it was resolved
A bug SHALL record its resolution date when it moves from Open or In Progress into Resolved, Closed or Won't Fix. Moving between those three SHALL keep the date. Moving back to Open or In Progress SHALL clear it. Every bug read SHALL report the date, or none for an unresolved bug. Editing any other field SHALL leave it unchanged.

#### Scenario: Resolving a bug
- **WHEN** a Contributor changes an Open bug to Resolved
- **THEN** the bug reports a resolution date at the time of that change

#### Scenario: Closing a resolved bug keeps the date
- **WHEN** a Contributor changes that Resolved bug to Closed a day later
- **THEN** its resolution date is still the moment it was resolved

#### Scenario: Reopening clears it
- **WHEN** a Contributor changes a Closed bug to Open
- **THEN** the bug reports no resolution date

#### Scenario: Other edits leave it alone
- **WHEN** a Contributor renames a Won't Fix bug
- **THEN** its resolution date is unchanged

#### Scenario: New bugs are unresolved
- **WHEN** a bug is filed, or auto-created for a failed run
- **THEN** it reports no resolution date

### Requirement: Existing resolved bugs get a resolution date
When the resolution date is introduced, every bug already Resolved, Closed or Won't Fix SHALL get one: the time of its latest status change into one of those statuses, as recorded in the activity log, or its last update when the log has none. Bugs in Open or In Progress SHALL get none.

#### Scenario: Backfilled from history
- **WHEN** a bug was changed from Open to Resolved on 3 March and to Closed on 5 March before the date existed
- **THEN** its resolution date is 3 March

#### Scenario: No recorded status change
- **WHEN** a Resolved bug has no status-change entry in the activity log
- **THEN** its resolution date is its last update time
