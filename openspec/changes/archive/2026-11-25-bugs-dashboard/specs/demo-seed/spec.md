# Spec Delta

## MODIFIED Requirements

### Requirement: The dataset has a believable history
Seeded rows SHALL carry creation and update times spread over the three weeks before the seed runs, in an order that matches the lifecycle: created before started, started before completed. One seeded bug, and the tags it carries, SHALL be older, reported about six weeks before the seed runs (see "One seeded bug needs attention for being idle"). Each seeded change of a kind the app logs (folder creation, tag creation, execution lifecycle steps, run outcomes, bug filing and updates) SHALL have an activity entry with the matching time and the acting teammate or user, written the way the app writes it.

#### Scenario: History spans weeks and people
- **WHEN** the seeded project's activity entries are listed
- **THEN** they span roughly the last three weeks, apart from the older bug and its tags, and name more than one actor

## ADDED Requirements

### Requirement: One seeded bug needs attention for being idle
The seed SHALL add one Open bug of Medium severity, reported about six weeks before the seed runs and never updated since, not filed from a run. On the Bugs dashboard it SHALL be listed in Needs Attention as Idle and counted as Old in Backlog Age.

#### Scenario: The idle bug on the dashboard
- **WHEN** the seeded user opens the Bugs dashboard
- **THEN** Needs Attention lists the six-week-old bug with the Idle badge, and Backlog Age shows an Old part of 1

### Requirement: Seeded bugs carry tags in uneven numbers
The seed SHALL add project tags, each with a colour, and attach them to seeded bugs so that at least one tag is carried by three or more bugs and at least one by exactly one. The tags SHALL be created before the earliest bug that carries them. A bug's filing entry SHALL name the tags it was filed with, as the app writes it.

#### Scenario: The tag cloud on the demo
- **WHEN** the seeded user opens the Bugs dashboard
- **THEN** Bugs by Tag shows several tags in different sizes

#### Scenario: Tags on the bug list
- **WHEN** the seeded user filters the bug list by a seeded tag
- **THEN** only the seeded bugs carrying it are listed
