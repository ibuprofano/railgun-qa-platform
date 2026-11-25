# trash-restore Specification

## Purpose

Lets Project Admins see what a project's members deleted and bring it back before the trash purge removes it for good (PRD §2.11, §6.11; ADR 0007, ADR 0022).

## Requirements

### Requirement: The trash lists one entry per deletion
The system SHALL list a project's trash as one entry per deletion: each deleted bug, each deleted execution, each test case deleted on its own, and each folder delete with everything it took. Test cases and subfolders deleted along with a folder SHALL NOT be listed on their own. Entries SHALL be ordered most recently deleted first.

#### Scenario: A folder delete is one entry
- **WHEN** an Admin deletes a folder holding a subfolder and three test cases, then reads the trash
- **THEN** the trash holds one folder entry reporting 2 folders and 3 test cases, and no entries for the subfolder or the test cases

#### Scenario: Separate deletions are separate entries
- **WHEN** an Admin deletes a test case and later deletes the folder it was in
- **THEN** the trash holds two entries, the folder first, then the test case

#### Scenario: Live items are not listed
- **WHEN** an Admin reads the trash of a project with no deleted items
- **THEN** the list is empty

### Requirement: Each trash entry says what was deleted, by whom, and when it will be removed
Each trash entry SHALL report its item type (test case, folder, execution or bug), id, name, the name of the user who deleted it, when, and the date 30 days after the deletion. It SHALL also give the whole days left until that date, rounded up, never below zero. A folder entry SHALL also report how many folders and test cases it holds.

#### Scenario: A bug deleted ten days ago
- **WHEN** an Admin reads the trash 10 days after Ana deleted the bug "Checkout total wrong"
- **THEN** its entry names the bug, Ana as the deleter and the deletion time, and reports 20 days left

#### Scenario: Due but not yet purged
- **WHEN** an Admin reads the trash 30 days and 2 hours after a deletion, before the purge has run
- **THEN** the entry is still listed with 0 days left

### Requirement: The trash can be filtered by item type
The trash list SHALL accept an optional item type (test case, folder, execution or bug) and then return only entries of that type. An unknown type SHALL be rejected with HTTP 400.

#### Scenario: Only bugs
- **WHEN** an Admin reads the trash filtered to bugs in a project with a deleted bug and a deleted execution
- **THEN** only the bug's entry is returned

#### Scenario: Unknown type
- **WHEN** a caller filters the trash by an unknown type
- **THEN** the request is rejected with HTTP 400

### Requirement: Only Project Admins read the trash and restore from it
Reading the trash and restoring from it SHALL require the `Admin` project role, which Workspace Owners hold implicitly in every project. Contributors and Viewers SHALL be refused with HTTP 403. Trash entries SHALL be tenant-isolated: another workspace's item SHALL return HTTP 404.

#### Scenario: A Contributor is refused
- **WHEN** a Contributor reads the trash or restores an item
- **THEN** the request is denied with HTTP 403 and nothing is restored

#### Scenario: A Workspace Owner restores
- **WHEN** a Workspace Owner with no explicit project membership restores a deleted bug
- **THEN** the bug is restored

#### Scenario: Another workspace's item
- **WHEN** an Admin restores, through their own project's route, a deleted bug that belongs to another workspace
- **THEN** the request returns HTTP 404 and that bug stays in the trash

### Requirement: Restoring brings a deletion back where it was
Restoring a trash entry SHALL bring back everything that deletion removed, all at once, so each restored item shows in its lists again: a bug with its links, an execution with its runs as a Draft, a test case in its folder, or a folder with all of its subfolders and test cases. An item can be restored until the purge removes it. An id that is not a listed trash entry SHALL return HTTP 404.

#### Scenario: Restoring a folder tree
- **WHEN** an Admin restores a folder that was deleted with a subfolder and three test cases
- **THEN** the folder, the subfolder and the three test cases are all back in the tree, under the folder's former parent

#### Scenario: Restoring an execution
- **WHEN** an Admin restores a deleted Draft execution with four runs
- **THEN** the execution is listed again as a Draft with its four runs in their former order

#### Scenario: Restoring a bug
- **WHEN** an Admin restores a deleted bug that was linked to a run
- **THEN** the bug is listed again, still linked to that run

#### Scenario: Restoring twice
- **WHEN** an Admin restores a bug, then sends the same restore again
- **THEN** the second request returns HTTP 404

#### Scenario: A test case deleted with its folder
- **WHEN** an Admin restores by its own id a test case that was deleted along with its folder
- **THEN** the request returns HTTP 404 and nothing is restored

### Requirement: Restoring an item inside a trashed folder restores that folder's deletion too
When a restored test case or folder sits in a folder that is still in the trash, the restore SHALL also bring back, in the same request, the whole deletion that took that folder. This SHALL repeat up the tree until the item's folder path is live. Deletions that sit below the restored folders SHALL stay in the trash.

#### Scenario: A test case whose folder was deleted later
- **WHEN** an Admin restores a test case that was deleted on its own, after which its folder "Checkout" was deleted with two other test cases
- **THEN** the test case, "Checkout" and its two other test cases are all live again

#### Scenario: An earlier deletion inside a restored folder stays in the trash
- **WHEN** an Admin restores the folder "Checkout", inside which a test case had been deleted on its own before "Checkout" was deleted
- **THEN** "Checkout" is live again and that test case is still in the trash

### Requirement: A restored item goes back to its former position when it is free
A restored test case or folder SHALL return to its former place among its siblings. If a live sibling now holds that place, the restored item SHALL go after the last sibling instead.

#### Scenario: The former place is free
- **WHEN** an Admin restores a test case that was second in its folder, and nothing was added to that folder since
- **THEN** it is second in the folder again

#### Scenario: The former place is taken
- **WHEN** an Admin restores a test case and a test case created later now holds its former place
- **THEN** the restored test case is last in its folder

### Requirement: A restore that would clash is refused and changes nothing
A restore SHALL be refused with HTTP 409 and a reason, restoring nothing, when:
- a folder it would bring back has the same name, ignoring case, as a live folder in the same parent. The reason SHALL name that folder.
- it would put a folder deeper than the 4-level limit, because its live parent was moved deeper while it was in the trash.
- it would bring back an automatically filed bug for a run attempt that has another live automatically filed bug.

#### Scenario: A folder name is taken
- **WHEN** an Admin restores the deleted folder "Checkout" while a live folder "checkout" exists in the same parent
- **THEN** the request is refused with HTTP 409 naming "checkout", and the deleted folder and its contents stay in the trash

#### Scenario: A parent folder's name is taken
- **WHEN** an Admin restores a test case whose deleted folder "Checkout" would come back next to a live folder "Checkout"
- **THEN** the request is refused with HTTP 409, and the test case and the folder stay in the trash

#### Scenario: The parent moved too deep
- **WHEN** an Admin restores a two-level folder deleted from a level-2 parent that has since moved to level 3
- **THEN** the request is refused with HTTP 409 and the folder stays in the trash

#### Scenario: A second auto-filed bug exists
- **WHEN** an Admin restores an automatically filed bug after the run failed again and got a new automatically filed bug
- **THEN** the request is refused with HTTP 409 and the deleted bug stays in the trash

### Requirement: Each restored deletion is recorded in the activity log
A restore SHALL write one activity entry for each deletion it brings back, attributed to the restoring user and in the same transaction. Each entry SHALL carry the item's name and the category of the item's own type. A folder entry SHALL record how many folders and test cases came back. A refused restore SHALL write nothing.

#### Scenario: A test case with its folder
- **WHEN** an Admin restores a test case whose folder's deletion is brought back with it
- **THEN** two new entries exist: one for the test case and one for the folder

#### Scenario: A refused restore
- **WHEN** a restore is refused with HTTP 409
- **THEN** no activity entry is written
