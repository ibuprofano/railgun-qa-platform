# trash-screen Specification

## Purpose

The web Trash screen (PRD §6.11): where Project Admins see the active project's deleted test cases, folders, executions and bugs, and restore them before they are permanently removed.

## Requirements

### Requirement: The Trash screen is available to Project Admins
The web app SHALL offer a Trash screen for the active project, reachable from the navigation by users with Admin access to it. A user without Admin access who opens its address SHALL see an access-denied state instead of the trash.

#### Scenario: An Admin opens Trash
- **WHEN** a Project Admin selects Trash in the navigation
- **THEN** the Trash screen for the active project is shown and marked as the current screen

#### Scenario: A Contributor has no Trash link
- **WHEN** a Contributor views the navigation
- **THEN** no Trash item is shown

#### Scenario: A Contributor opens the address directly
- **WHEN** a Contributor opens the Trash address
- **THEN** an access-denied state is shown and nothing can be restored

### Requirement: The Trash screen lists each deletion with its removal countdown
The screen SHALL list the project's trash entries, most recently deleted first. Each row SHALL show the item type with its icon, the name, who deleted it, when (relative, exact time on hover) and the days left before permanent removal. A folder row SHALL also say how many subfolders and test cases it holds. With nothing in the trash, an empty state SHALL say so.

#### Scenario: A folder deleted yesterday
- **WHEN** an Admin opens Trash the day after Ana deleted the folder "Checkout" with one subfolder and four test cases
- **THEN** a row shows a folder icon, "Checkout", "1 folder, 4 test cases", Ana, "1 day ago" and "29 days left"

#### Scenario: Due for removal
- **WHEN** an entry has 0 days left
- **THEN** its row says it will be removed at the next cleanup instead of showing a number of days

#### Scenario: An empty trash
- **WHEN** an Admin opens Trash in a project with nothing deleted
- **THEN** an empty state says the trash is empty

### Requirement: The Trash screen filters by item type
The screen SHALL offer a filter with All, Test Cases, Folders, Executions and Bugs, with All selected by default. Selecting a type SHALL list only that type's entries.

#### Scenario: Only executions
- **WHEN** an Admin selects Executions in the filter
- **THEN** only execution rows are listed

### Requirement: Restore brings an item back and says what came back
Each row SHALL have a Restore action, disabled while its request is pending. When it succeeds, the row SHALL leave the list, a confirmation SHALL name the restored item and any parent folders restored with it, and the Test Cases, Executions and Bugs screens SHALL show the restored items without a reload.

#### Scenario: Restoring a test case
- **WHEN** an Admin restores the test case "Pay with card" from Trash, then opens Test Cases
- **THEN** a confirmation names "Pay with card", the row is gone from Trash, and the test case is in its folder in the tree

#### Scenario: Restoring a test case with its folder
- **WHEN** an Admin restores a test case whose folder "Checkout" is also in the trash
- **THEN** the confirmation says "Checkout" was restored too, and the "Checkout" row is gone from Trash as well

### Requirement: A refused restore shows its reason on the row
When a restore is refused, the reason from the server SHALL be shown on that row, and the row SHALL stay in the list.

#### Scenario: A folder name clash
- **WHEN** an Admin restores the folder "Checkout" while a live folder "Checkout" exists in the same place
- **THEN** the row stays and shows the reason, naming the live folder
