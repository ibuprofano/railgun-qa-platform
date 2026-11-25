import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExecutionActor } from '../executions/execution-queries';
import { logExecutionActivity } from '../executions/execution-queries';
import { logBugActivity } from '../bugs/bug-queries';
import { folderDepth, keyForAppend, logTreeActivity, subtreeHeight } from '../folders/folder-queries';
import { fitsDepth } from '../folders/tree-rules';
import { emitExecutionChanged, emitRunBugsChanged } from '../realtime/live-event';

/**
 * The project trash (PRD §6.11, ADR 0022, specs/trash-restore). One entry per deletion,
 * the same unit the worker's trash_purge removes (apps/worker/src/tasks/trash-purge.ts):
 * a bug, an execution, a test case deleted on its own, or a folder delete with everything
 * it took (one deletion_id). The predicates below mirror the purge's on purpose.
 */

/** ADR 0007: deleted items are purged after this many days (the worker uses the same constant). */
export const TRASH_RETENTION_DAYS = 30;

export const TRASH_TYPES = ['test-case', 'folder', 'execution', 'bug'] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

export function isTrashType(value: unknown): value is TrashType {
  return typeof value === 'string' && (TRASH_TYPES as readonly string[]).includes(value);
}

/** The list's optional `type` filter; an unknown value is a 400. */
export function parseTrashType(value: unknown): TrashType | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!isTrashType(value)) {
    throw new BadRequestException(`type must be one of: ${TRASH_TYPES.join(', ')}`);
  }
  return value;
}

export interface TrashEntry {
  type: TrashType;
  id: string;
  name: string;
  deletedAt: string;
  /** As recorded in the delete's activity entry; null when there is none. */
  deletedByName: string | null;
  /** deletedAt + 30 days: from then on the next purge run removes it. */
  purgeAfter: string;
  /** Whole days until purgeAfter, rounded up, never below zero. */
  daysLeft: number;
  /** Folder entries only: folders (including the deleted folder itself) and test cases it took. */
  folders?: number;
  testCases?: number;
}

interface TrashRow {
  type: TrashType;
  id: string;
  name: string;
  deleted_at: Date;
  deleted_by_name: string | null;
  purge_after: Date;
  days_left: number;
  folders: number | null;
  test_cases: number | null;
}

/** A test case that was deleted on its own, not taken by a folder delete (the purge's predicate). */
const INDIVIDUAL_TEST_CASE = Prisma.sql`
  t.deleted_at IS NOT NULL
  AND (t.deletion_id IS NULL OR NOT EXISTS (SELECT 1 FROM folder g WHERE g.deletion_id = t.deletion_id))
`;

/** The root of a folder delete: a deleted folder whose parent isn't in the same deletion. */
const FOLDER_ROOT = Prisma.sql`
  f.deleted_at IS NOT NULL AND f.deletion_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM folder p WHERE p.id = f.parent_folder_id AND p.deletion_id = f.deletion_id)
`;

export async function listTrash(
  tx: Prisma.TransactionClient,
  projectId: string,
  type: TrashType | undefined,
): Promise<TrashEntry[]> {
  const days = TRASH_RETENTION_DAYS;
  const parts: Prisma.Sql[] = [];
  const want = (t: TrashType) => type === undefined || type === t;

  if (want('bug')) {
    parts.push(Prisma.sql`
      SELECT 'bug' AS type, b.id, b.title AS name, b.deleted_at, b.deleted_by, NULL::int AS folders, NULL::int AS test_cases
      FROM bug b WHERE b.project_id = ${projectId}::uuid AND b.deleted_at IS NOT NULL`);
  }
  if (want('execution')) {
    parts.push(Prisma.sql`
      SELECT 'execution', e.id, e.name, e.deleted_at, e.deleted_by, NULL::int, NULL::int
      FROM test_execution e WHERE e.project_id = ${projectId}::uuid AND e.deleted_at IS NOT NULL`);
  }
  if (want('test-case')) {
    parts.push(Prisma.sql`
      SELECT 'test-case', t.id, t.name, t.deleted_at, t.deleted_by, NULL::int, NULL::int
      FROM test_case t WHERE t.project_id = ${projectId}::uuid AND ${INDIVIDUAL_TEST_CASE}`);
  }
  if (want('folder')) {
    parts.push(Prisma.sql`
      SELECT 'folder', f.id, f.name, f.deleted_at, f.deleted_by,
        (SELECT count(*) FROM folder g WHERE g.deletion_id = f.deletion_id)::int,
        (SELECT count(*) FROM test_case c WHERE c.deletion_id = f.deletion_id)::int
      FROM folder f WHERE f.project_id = ${projectId}::uuid AND ${FOLDER_ROOT}`);
  }

  // The deleter's name comes from the item's latest delete entry: "user" rows are only
  // readable by their owner (RLS self_access), so names are never joined from there.
  const rows = await tx.$queryRaw<TrashRow[]>`
    SELECT d.type, d.id, d.name, d.deleted_at, deleter.actor_display_name AS deleted_by_name,
      d.deleted_at + make_interval(days => ${days}::int) AS purge_after,
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (d.deleted_at + make_interval(days => ${days}::int) - now())) / 86400))::int AS days_left,
      d.folders, d.test_cases
    FROM (${Prisma.join(parts, ' UNION ALL ')}) AS d (type, id, name, deleted_at, deleted_by, folders, test_cases)
    LEFT JOIN LATERAL (
      SELECT a.actor_display_name FROM activity_entries a
      WHERE a.project_id = ${projectId}::uuid AND a.entity_id = d.id
        AND a.action_code = CASE d.type
          WHEN 'bug' THEN 'bug.deleted'
          WHEN 'execution' THEN 'test_execution.deleted'
          WHEN 'test-case' THEN 'test_case.deleted'
          ELSE 'folder.deleted'
        END
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1
    ) deleter ON TRUE
    ORDER BY d.deleted_at DESC, d.id
  `;

  return rows.map((row) => ({
    type: row.type,
    id: row.id,
    name: row.name,
    deletedAt: row.deleted_at.toISOString(),
    deletedByName: row.deleted_by_name,
    purgeAfter: row.purge_after.toISOString(),
    daysLeft: row.days_left,
    ...(row.type === 'folder' ? { folders: row.folders ?? 0, testCases: row.test_cases ?? 0 } : {}),
  }));
}

export interface RestoredItem {
  type: TrashType;
  id: string;
  name: string;
}

const notInTrash = () => new NotFoundException('item not found in the trash');

/**
 * Restores one trash entry, in the caller's withTenantContext transaction (ADR 0022,
 * activity-and-trash design.md decision 4). Any refusal throws, so the transaction rolls
 * back and nothing is restored. Returns the requested item first, then the folders that
 * came back with it, nearest first.
 */
export function restoreTrashItem(
  tx: Prisma.TransactionClient,
  actor: ExecutionActor,
  type: TrashType,
  id: string,
): Promise<RestoredItem[]> {
  switch (type) {
    case 'bug':
      return restoreBug(tx, actor, id);
    case 'execution':
      return restoreExecution(tx, actor, id);
    case 'test-case':
    case 'folder':
      return restoreTreeItem(tx, actor, type, id);
  }
}

async function restoreBug(tx: Prisma.TransactionClient, actor: ExecutionActor, id: string): Promise<RestoredItem[]> {
  const [bug] = await tx.$queryRaw<{ id: string; title: string; auto_created: boolean; test_run_id: string | null; attempt: number | null }[]>`
    SELECT id, title, auto_created, test_run_id, attempt FROM bug
    WHERE id = ${id}::uuid AND project_id = ${actor.projectId}::uuid AND deleted_at IS NOT NULL
    FOR UPDATE
  `;
  if (!bug) {
    throw notInTrash();
  }
  // bug_one_auto_per_run_attempt_idx: one live auto-filed bug per run attempt (ADR 0020 decision 6).
  if (bug.auto_created && bug.test_run_id) {
    const [other] = await tx.$queryRaw<{ title: string }[]>`
      SELECT title FROM bug
      WHERE test_run_id = ${bug.test_run_id}::uuid AND attempt IS NOT DISTINCT FROM ${bug.attempt}::int
        AND auto_created AND deleted_at IS NULL AND id <> ${bug.id}::uuid
      LIMIT 1
    `;
    if (other) {
      throw new ConflictException(
        `the run already has an automatically filed bug for this attempt ("${other.title}"); delete it first to restore this one`,
      );
    }
  }

  await tx.$executeRaw`
    UPDATE bug SET deleted_at = NULL, deleted_by = NULL, updated_at = now() WHERE id = ${bug.id}::uuid
  `;
  await logBugActivity(tx, actor, 'bug.restored', { id: bug.id, title: bug.title });

  // specs/live-updates: a restored bug linked to a run of a live execution changes that run's bugs.
  const [linked] = await tx.$queryRaw<{ run_id: string; execution_id: string }[]>`
    SELECT r.id AS run_id, r.execution_id FROM test_run r JOIN test_execution e ON e.id = r.execution_id
    WHERE r.id = ${bug.test_run_id}::uuid AND e.deleted_at IS NULL
  `;
  if (linked) {
    await emitRunBugsChanged(tx, actor, linked.execution_id, linked.run_id);
  }
  return [{ type: 'bug', id: bug.id, name: bug.title }];
}

async function restoreExecution(tx: Prisma.TransactionClient, actor: ExecutionActor, id: string): Promise<RestoredItem[]> {
  const [execution] = await tx.$queryRaw<{ id: string; name: string }[]>`
    UPDATE test_execution SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND project_id = ${actor.projectId}::uuid AND deleted_at IS NOT NULL
    RETURNING id, name
  `;
  if (!execution) {
    throw notInTrash();
  }
  await logExecutionActivity(tx, actor, 'test_execution.restored', { type: 'test_execution', id: execution.id, name: execution.name });
  await emitExecutionChanged(tx, actor, execution.id);
  return [{ type: 'execution', id: execution.id, name: execution.name }];
}

interface GroupRoot {
  deletion_id: string;
  id: string;
  name: string;
  parent_folder_id: string | null;
  folders: number;
  test_cases: number;
}

/**
 * Deletion ids of every trashed folder from `folderId` up to the root, nearest first.
 * The whole chain is walked rather than stopping at the first live folder, so nothing
 * depends on "a live folder never sits under a deleted one".
 */
async function ancestorGroups(tx: Prisma.TransactionClient, folderId: string | null): Promise<string[]> {
  if (folderId === null) {
    return [];
  }
  const rows = await tx.$queryRaw<{ deletion_id: string }[]>`
    WITH RECURSIVE up AS (
      SELECT id, parent_folder_id, deleted_at, deletion_id, 1 AS level FROM folder WHERE id = ${folderId}::uuid
      UNION ALL
      SELECT f.id, f.parent_folder_id, f.deleted_at, f.deletion_id, up.level + 1
      FROM folder f JOIN up ON f.id = up.parent_folder_id
    )
    SELECT deletion_id FROM up
    WHERE deleted_at IS NOT NULL AND deletion_id IS NOT NULL
    GROUP BY deletion_id
    ORDER BY min(level)
  `;
  return rows.map((row) => row.deletion_id);
}

/** A test case deleted on its own, or a folder delete, plus the deletions of its trashed ancestors. */
async function restoreTreeItem(
  tx: Prisma.TransactionClient,
  actor: ExecutionActor,
  type: 'test-case' | 'folder',
  id: string,
): Promise<RestoredItem[]> {
  const projectId = actor.projectId;

  // 1. Lock the requested item, using the same predicate as the list.
  let testCase: { id: string; name: string; folder_id: string | null } | null = null;
  let groups: string[];
  if (type === 'test-case') {
    const [row] = await tx.$queryRaw<{ id: string; name: string; folder_id: string | null }[]>`
      SELECT t.id, t.name, t.folder_id FROM test_case t
      WHERE t.id = ${id}::uuid AND t.project_id = ${projectId}::uuid AND ${INDIVIDUAL_TEST_CASE}
      FOR UPDATE
    `;
    if (!row) {
      throw notInTrash();
    }
    testCase = row;
    groups = await ancestorGroups(tx, row.folder_id);
  } else {
    const [row] = await tx.$queryRaw<{ deletion_id: string; parent_folder_id: string | null }[]>`
      SELECT f.deletion_id, f.parent_folder_id FROM folder f
      WHERE f.id = ${id}::uuid AND f.project_id = ${projectId}::uuid AND ${FOLDER_ROOT}
      FOR UPDATE
    `;
    if (!row) {
      throw notInTrash();
    }
    groups = [row.deletion_id, ...(await ancestorGroups(tx, row.parent_folder_id))];
  }

  // 2. Lock every row of those deletions, and find each deletion's root with its counts.
  if (groups.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM folder WHERE deletion_id = ANY(${groups}::uuid[]) AND deleted_at IS NOT NULL FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM test_case WHERE deletion_id = ANY(${groups}::uuid[]) AND deleted_at IS NOT NULL FOR UPDATE
    `;
  }
  const roots = groups.length === 0 ? [] : await tx.$queryRaw<GroupRoot[]>`
    SELECT f.deletion_id, f.id, f.name, f.parent_folder_id,
      (SELECT count(*) FROM folder g WHERE g.deletion_id = f.deletion_id AND g.deleted_at IS NOT NULL)::int AS folders,
      (SELECT count(*) FROM test_case c WHERE c.deletion_id = f.deletion_id AND c.deleted_at IS NOT NULL)::int AS test_cases
    FROM folder f
    WHERE f.deletion_id = ANY(${groups}::uuid[]) AND ${FOLDER_ROOT}
  `;
  const rootOf = new Map(roots.map((root) => [root.deletion_id, root]));

  // 3. Name check, before any write: a restored folder must not share a name (ignoring
  // case) with a live folder, or another restored one, in the same parent (ADR 0022 decision 3).
  if (groups.length > 0) {
    const [clash] = await tx.$queryRaw<{ name: string }[]>`
      WITH restored AS (
        SELECT id, parent_folder_id, name FROM folder
        WHERE deletion_id = ANY(${groups}::uuid[]) AND deleted_at IS NOT NULL
      ),
      final AS (
        SELECT id, parent_folder_id, name FROM restored
        UNION ALL
        SELECT id, parent_folder_id, name FROM folder WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
      )
      SELECT o.name FROM restored r
      JOIN final o ON o.id <> r.id AND lower(o.name) = lower(r.name)
        AND o.parent_folder_id IS NOT DISTINCT FROM r.parent_folder_id
      LIMIT 1
    `;
    if (clash) {
      throw new ConflictException(
        `a folder named "${clash.name}" already exists in the same place; rename it, then restore`,
      );
    }
  }

  // 5. Bring everything back. Clearing deletion_id keeps a later purge from treating these
  // live rows as part of the old tree (design.md decision 4, step 5).
  if (groups.length > 0) {
    await tx.$executeRaw`
      UPDATE folder SET deleted_at = NULL, deleted_by = NULL, deletion_id = NULL, updated_at = now()
      WHERE deletion_id = ANY(${groups}::uuid[]) AND deleted_at IS NOT NULL
    `;
    await tx.$executeRaw`
      UPDATE test_case SET deleted_at = NULL, deleted_by = NULL, deletion_id = NULL
      WHERE deletion_id = ANY(${groups}::uuid[]) AND deleted_at IS NOT NULL
    `;
  }
  if (testCase) {
    await tx.$executeRaw`
      UPDATE test_case SET deleted_at = NULL, deleted_by = NULL, deletion_id = NULL WHERE id = ${testCase.id}::uuid
    `;
  }

  // Depth check (after the update, since subtreeHeight counts live rows only). Inner
  // levels keep their relative depth, so only each deletion's root needs checking.
  for (const root of roots) {
    if (!fitsDepth(await folderDepth(tx, root.parent_folder_id), await subtreeHeight(tx, root.id))) {
      throw new ConflictException(
        `restoring folder "${root.name}" would nest folders deeper than the 4-level limit; move its parent folder up first`,
      );
    }
  }

  // 4. Positions: back to the former place when free, otherwise last (ADR 0022 decision 4).
  for (const root of roots) {
    await moveLastIfTaken(tx, 'folder', projectId, root.id, root.parent_folder_id);
  }
  if (testCase) {
    await moveLastIfTaken(tx, 'test_case', projectId, testCase.id, testCase.folder_id);
  }

  // 6. One entry per restored deletion: the requested item first, then ancestors nearest first.
  const restored: RestoredItem[] = [];
  const requested: RestoredItem = testCase
    ? { type: 'test-case', id: testCase.id, name: testCase.name }
    : { type: 'folder', id, name: rootOf.get(groups[0])!.name };
  if (testCase) {
    await logTreeActivity(tx, actor, 'test_case.restored', { type: 'test_case', id: testCase.id, name: testCase.name });
  }
  for (const [index, group] of groups.entries()) {
    const root = rootOf.get(group);
    if (!root) {
      continue;
    }
    const isRequested = !testCase && index === 0;
    await logTreeActivity(tx, actor, 'folder.restored', { type: 'folder', id: root.id, name: root.name }, {
      deletionId: group,
      folders: root.folders,
      testCases: root.test_cases,
      ...(isRequested ? {} : { restoredWith: { type: requested.type, id: requested.id, name: requested.name } }),
    });
    restored.push({ type: 'folder', id: root.id, name: root.name });
  }
  return testCase ? [requested, ...restored] : restored;
}

/** Moves a restored item after its last same-kind sibling when a live sibling now holds its key. */
async function moveLastIfTaken(
  tx: Prisma.TransactionClient,
  table: 'folder' | 'test_case',
  projectId: string,
  itemId: string,
  parentId: string | null,
): Promise<void> {
  const parent = Prisma.raw(table === 'folder' ? 'parent_folder_id' : 'folder_id');
  const items = Prisma.raw(table);
  const [taken] = await tx.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM ${items} o JOIN ${items} me ON me.id = ${itemId}::uuid
    WHERE o.project_id = ${projectId}::uuid AND o.deleted_at IS NULL AND o.id <> me.id
      AND o.${parent} IS NOT DISTINCT FROM ${parentId}::uuid AND o.position_key = me.position_key
    LIMIT 1
  `;
  if (!taken) {
    return;
  }
  const key = await keyForAppend(tx, table, projectId, parentId);
  await tx.$executeRaw`UPDATE ${items} SET position_key = ${key} WHERE id = ${itemId}::uuid`;
}
