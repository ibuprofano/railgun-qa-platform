# Spec Delta

## Purpose

Defines the Bugs dashboard PDF (PRD §8): what it shows and that every figure in it matches the Bugs dashboard for the same project, time zone and range.

## ADDED Requirements

### Requirement: The Bugs dashboard report shows the dashboard's content
The Bugs dashboard report SHALL show, in this order: a title with the project's name, the generation date and the range; the four stat tiles; both Reported vs Resolved charts for the selected range; the four donuts with their legends; Avg Resolution Time; the tag counts; and the Needs Attention table with its badges.

#### Scenario: A project with bugs
- **WHEN** a member downloads the Bugs dashboard report of a project with tagged, open and resolved bugs
- **THEN** the PDF shows each of those sections, in that order

#### Scenario: Nothing needs attention
- **WHEN** no open bug is Idle or Unattended
- **THEN** the report says that no bugs need attention in place of the table

### Requirement: The report's figures match the dashboard
Every number in the Bugs dashboard report SHALL equal what the Bugs dashboard shows for the same project, time zone and range at the moment the report is generated, using the bug-metrics definitions. Both Reported vs Resolved charts SHALL cover the range selected on screen.

#### Scenario: Same numbers as the screen
- **WHEN** the dashboard shows Total Bugs 7, Open 2, Resolved 2 and Critical 2, and a member downloads the report
- **THEN** the report's tiles read 7, 2, 2 and 2

#### Scenario: The selected range
- **WHEN** a member downloads the report with the charts set to 7 days
- **THEN** both charts in the PDF cover the last 7 days in the member's time zone

### Requirement: The report renders every script
The Bugs dashboard report SHALL render Japanese, Portuguese and English text wherever it shows user text, including bug titles, tag names and chart labels.

#### Scenario: A Japanese tag
- **WHEN** a bug carries the tag "決済" and its title is in Japanese
- **THEN** both appear in the PDF, legibly, in the tag counts and in Needs Attention
