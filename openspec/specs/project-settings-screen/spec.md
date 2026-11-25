# project-settings-screen Specification

## Purpose

The Project Settings screen, where a Project Admin configures the active project: its General section (name and slug) and its Environments section (environments and their credentials).

## Requirements

### Requirement: Project Settings is available to Project Admins
The web app SHALL offer a Project Settings screen for the active project, reachable from the navigation by users with Admin access to it. A user without Admin access who opens its address SHALL see an access-denied state instead of the settings.

#### Scenario: Admin opens Project Settings
- **WHEN** a Project Admin selects Project Settings in the navigation
- **THEN** the Project Settings screen for the active project is shown

#### Scenario: Contributor opens the address directly
- **WHEN** a Contributor opens the Project Settings address
- **THEN** an access-denied state is shown and no setting can be changed

### Requirement: The General section edits the project name and shows its slug
The General section SHALL show the project name in an editable field that saves when confirmed, with validation errors shown inline, and the slug as read-only text. A successful save SHALL update the name everywhere it is shown, including the project switcher.

#### Scenario: Renaming the project
- **WHEN** an Admin changes the name to "Checkout Web" and confirms
- **THEN** the name is saved and the project switcher shows "Checkout Web"

#### Scenario: Slug is read-only
- **WHEN** an Admin views the General section
- **THEN** the slug is shown and cannot be edited

### Requirement: The Environments section lists the project's environments
Below General, Project Settings SHALL show an Environments section listing each of the project's environments with its name, base URL, default browser and number of credentials, oldest first (the order the New Execution picker uses), with an **Add environment** button and Edit and Delete actions on each row. With no environments it SHALL say "No environments yet" and still offer Add environment.

#### Scenario: Listing environments
- **WHEN** an Admin opens Project Settings in a project where "Staging" (2 credentials) was created before "Production" (1 credential)
- **THEN** the Environments section lists "Staging" then "Production", each with its base URL, default browser and credential count

#### Scenario: No environments yet
- **WHEN** an Admin opens Project Settings in a project with no environments
- **THEN** the section says "No environments yet" and Add environment is available

### Requirement: Admins add an environment with its credentials
Add environment SHALL open the environment editor, empty, with Chromium as the default browser. It SHALL take a name, a base URL, a default browser and any number of credentials, each with an alias, an email and a password. Saving SHALL create the environment, close the editor, and show it in the list.

#### Scenario: Adding an environment
- **WHEN** an Admin adds "Staging" with base URL `https://staging.shop.test`, browser Firefox, and credential "admin" (`admin@shop.test`, a password), and saves
- **THEN** "Staging" appears in the list with Firefox and 1 credential, and the editor closes

#### Scenario: An environment without credentials
- **WHEN** an Admin adds an environment with a name and base URL and no credentials, and saves
- **THEN** the environment is created with 0 credentials

### Requirement: The editor checks its fields before saving
The editor SHALL require a name, a base URL starting with `http://` or `https://`, and, for each credential, an alias, a valid email, and a password unless the credential already exists. Two credentials in the same environment SHALL NOT share an alias. Each problem SHALL be shown next to its field, and nothing SHALL be saved while one remains. A refusal from the server SHALL be shown in the editor, which stays open with its values.

#### Scenario: A malformed base URL
- **WHEN** an Admin enters `staging.shop.test` as the base URL and saves
- **THEN** the editor says the base URL must start with http:// or https:// and nothing is saved

#### Scenario: A repeated alias
- **WHEN** an Admin gives two credentials the alias "admin" and saves
- **THEN** the editor marks the repeated alias and nothing is saved

#### Scenario: The server refuses the change
- **WHEN** the server rejects a save
- **THEN** the editor shows the server's message and keeps what the Admin entered

### Requirement: Editing keeps a credential's password unless it is replaced
Edit SHALL open the editor filled with the environment's name, base URL, default browser and credentials. An existing credential's password SHALL show as masked and empty: left empty, the stored password is kept; filled in, it replaces it. Removing a credential row and saving SHALL delete that credential. Saving SHALL update the list.

#### Scenario: Changing the base URL only
- **WHEN** an Admin edits "Staging", changes its base URL, and saves without touching the credentials
- **THEN** the base URL is updated and every credential keeps its stored password

#### Scenario: Replacing one password and removing a credential
- **WHEN** an Admin edits "Staging", types a new password for "admin", removes "buyer", and saves
- **THEN** "admin" has the new password, "buyer" no longer exists, and the list shows 1 credential

### Requirement: Admins can reveal a stored password in the editor
For each existing credential, the editor SHALL offer **Reveal password**, which reveals it through the audited reveal and shows it in the editor. A revealed password SHALL be shown only while that editor is open, and SHALL NOT be kept after it closes.

#### Scenario: Revealing in the editor
- **WHEN** an Admin presses Reveal password for "admin" in the editor
- **THEN** the password is shown next to "admin", and the reveal is recorded in the Activity log

#### Scenario: Closing forgets the password
- **WHEN** an Admin reveals a password, closes the editor, and opens it again
- **THEN** the password is masked again

### Requirement: Admins delete an environment after confirming
Delete SHALL ask for confirmation, naming the environment and saying that it and its credentials are removed permanently and that executions which used it keep its name. Confirming SHALL delete it and remove it from the list; cancelling SHALL change nothing.

#### Scenario: Deleting an environment
- **WHEN** an Admin deletes "Staging" and confirms
- **THEN** "Staging" disappears from the list, and executions that used it still show "Staging"

#### Scenario: Cancelling a delete
- **WHEN** an Admin presses Delete on "Staging" and cancels
- **THEN** "Staging" is still listed

### Requirement: Environment changes reach the rest of the app without a reload
After an environment is added, edited or deleted, the New Execution dialog's environment picker and the execution's environment panel SHALL show the change the next time they are shown, without reloading the page.

#### Scenario: A new environment in New Execution
- **WHEN** an Admin adds "Staging" in Project Settings, then opens New Execution
- **THEN** "Staging" is offered in the environment picker
