# Spec Delta

## ADDED Requirements

### Requirement: Seeded resolved bugs carry a resolution date
Every seeded bug in Resolved, Closed or Won't Fix status SHALL carry a resolution date equal to the time of its seeded status change. Seeded bugs in Open or In Progress SHALL carry none.

#### Scenario: A seeded resolved bug
- **WHEN** the seeded user reads a seeded bug that was resolved 12 days ago
- **THEN** its resolution date is 12 days ago, the time of its seeded status-change entry
