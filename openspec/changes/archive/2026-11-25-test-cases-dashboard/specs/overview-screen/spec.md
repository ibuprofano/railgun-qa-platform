# Spec Delta

## MODIFIED Requirements

### Requirement: Top Failing Tests shows the worst test cases and links to them
The screen SHALL show a Top Failing Tests panel. Each row SHALL show the test case's name, its fail rate (red at 75% or more, amber at 40% or more) and "X of Y runs failed", and SHALL open the test case on the Test Cases screen in a new tab. When failing test cases have fewer than 3 completed runs, the panel SHALL say how many: in place of the rows when none qualify, or below them otherwise. Only when no test case has failed SHALL the panel read "No failing tests — nice!".

#### Scenario: A failing test
- **WHEN** "Pay with card" failed 3 of its 4 runs
- **THEN** its row reads "75%" in red and "3 of 4 runs failed", and links to that test case

#### Scenario: No failing tests
- **WHEN** no test case has failed
- **THEN** the panel reads "No failing tests — nice!"

#### Scenario: Failing but too few runs
- **WHEN** no test case qualifies and 2 failing test cases have fewer than 3 completed runs
- **THEN** the panel reads "2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet."
