# Spec Delta

## ADDED Requirements

### Requirement: Top Failing Tests reports the failing test cases it leaves out
The Overview SHALL report how many live test cases have at least one Fail but fewer than 3 completed runs, and so are not listed in Top Failing Tests.

#### Scenario: Failing but too few runs
- **WHEN** test case A failed 3 of 4 runs, and B failed 1 of 2
- **THEN** Top Failing Tests lists A, and the Overview reports 1 failing test case below the minimum
