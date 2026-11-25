# ADR 0022: Restoring From the Trash

**Status:** Accepted
**Date:** 2026-11-24
**Amends:** [ADR 0007](0007-activity-log-and-trash-purge.md) (adds restore to the trash that ADR 0007's purge empties)

## Context

[PRD.md](../../PRD.md) §6.11 adds a Trash screen where Project Admins restore deleted test cases, folders, executions and bugs "to where it was". It adds one rule: "Restoring an item whose containing folder is also in the trash restores that folder as well." Two situations are left open:

- **What a deleted parent folder brings back.** A folder delete takes its subfolders and live test cases with it, under one `deletion_id`, and the purge (ADR 0007, `trash_purge`) removes such a tree as one unit. If a test case deleted on its own sits in a folder that was deleted later, "restoring that folder as well" could mean either the folder row alone or everything that folder's delete took.
- **What happens when the old place is no longer free.** Live sibling folders must have unique names, ignoring case, and folders nest at most 4 levels (PRD §2.3, amended). Both can change while an item sits in the trash.

## Decision

1. **The trash unit is the purge's unit.** The trash lists, and a restore brings back, one deletion at a time:
   - a bug
   - an execution
   - a test case deleted on its own
   - a folder delete, with every subfolder and test case it took

   An item taken by a folder delete is not listed or restorable on its own.
2. **Restoring an item inside a trashed folder brings back that folder's whole deletion.** This repeats up the tree until the item's folder path is live, all in one transaction. Deletions inside the restored folders, made before them, stay in the trash.
3. **A restore that would clash is refused, not adjusted.** The API answers 409 with the reason, and nothing is restored, when:
   - a folder it would bring back has the name of a live sibling (the reason names that folder)
   - it would push a folder past 4 levels
   - it would bring back a second automatically filed bug for the same run attempt

   The Admin renames or moves the live item and retries.
4. **Positions are kept when free.** A restored item goes back to its old place among its siblings, or last if that place is taken.
5. **Every restored deletion is logged** in the same transaction (`<type>.restored`), under the item type's usual category. A folder that came back because of another item records which item that was.

## Alternatives Considered

- **Restoring only the ancestor folder rows.** Less comes back, but deletions end up half restored: the trash list would show a folder tree whose root is live, and the purge would remove part of a tree under a live folder. Rejected for keeping each deletion all-or-nothing.
- **Auto-renaming a clashing folder** (e.g. "Checkout (restored)"). The restore always succeeds, but the Admin gets a name they didn't choose, possibly on an ancestor they didn't ask to restore. Rejected: a 409 naming the clash is one rename away from success.
- **Restoring at the end of the folder always.** Simpler, but "to where it was" would be true only for the parent, not the order.

## Consequences

- Restoring one test case can bring back a large folder tree. The success message and the activity log name every folder that came back with it.
- A restore clears `deletion_id` on the rows it brings back. Which delete an item came from survives only in the activity log (`folder.deleted` and `folder.restored` record the deletion id).
- Neither the purge nor the schema changes. The purge already re-checks "still due" in each delete, so a restore that commits first wins.

## Revisit Triggers

- Admins regularly restore single test cases out of large deleted folders and don't want the rest back, which would mean allowing restore of an item taken by a folder delete.
- Clash refusals turn out to be common, which would mean offering a rename inside the restore dialog.
