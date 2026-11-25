import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './cross-tenant-harness';
import { setUpProjectMember } from './execution-fixtures';
import { insertTestUser } from './membership-fixtures';
import { withTenantContext } from '../../src/common/tenant-context';

/**
 * Direct-to-database fixtures for the test case health and dashboard tests
 * (test-cases-dashboard): test cases, executions, runs with backdated outcomes and
 * earlier attempts, written as the API would leave them.
 */
export type Outcome = 'Pending' | 'Pass' | 'Fail' | 'NeedsReview';

export const DAY_MS = 86_400_000;
export const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

export interface DashboardSetup extends WorkspaceFixture {
  viewer: string;
  contributor: string;
  admin: string;
  /** A user row to own executions and bugs. */
  creator: string;
}

export async function setUpDashboardProject(prisma: PrismaClient, label: string): Promise<DashboardSetup> {
  const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
  return {
    ...f,
    viewer: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer'),
    contributor: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor'),
    admin: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin'),
    creator: await insertTestUser(prisma, `clerk-dash-${randomUUID()}`, 'Creator'),
  };
}

export interface TestCaseSpec {
  name: string;
  /** Defaults to a one-line script; null for a manual test case. */
  script?: string | null;
  status?: 'Draft' | 'Ready' | 'Deprecated';
  folderId?: string | null;
  createdDaysAgo?: number;
  scriptEditedDaysAgo?: number;
  tagIds?: string[];
}

let positionCounter = 0;

export async function insertTestCase(prisma: PrismaClient, s: DashboardSetup, spec: TestCaseSpec): Promise<string> {
  const id = randomUUID();
  const createdAt = daysAgo(spec.createdDaysAgo ?? 30);
  const scriptAt = spec.scriptEditedDaysAgo === undefined ? null : daysAgo(spec.scriptEditedDaysAgo);
  const script = spec.script === undefined ? `Given ${spec.name}` : spec.script;
  positionCounter += 1;
  await withTenantContext(prisma, s.workspaceId, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO test_case (id, project_id, workspace_id, name, gherkin_script, status, folder_id, position_key,
        created_at, updated_at, script_updated_at)
      VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${spec.name}, ${script}, ${spec.status ?? 'Ready'},
        ${spec.folderId ?? null}::uuid, ${`${String(positionCounter).padStart(8, '0')}1`}, ${createdAt}, ${scriptAt ?? createdAt},
        ${scriptAt})`;
    for (const tagId of spec.tagIds ?? []) {
      await tx.$executeRaw`INSERT INTO test_case_tag (test_case_id, tag_id, workspace_id)
        VALUES (${id}::uuid, ${tagId}::uuid, ${s.workspaceId}::uuid)`;
    }
  });
  return id;
}

export async function insertFolder(prisma: PrismaClient, s: DashboardSetup, name: string, parentId: string | null = null): Promise<string> {
  const id = randomUUID();
  positionCounter += 1;
  await withTenantContext(prisma, s.workspaceId, (tx) =>
    tx.$executeRaw`INSERT INTO folder (id, project_id, workspace_id, parent_folder_id, name, position_key)
      VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${parentId}::uuid, ${name},
        ${`${String(positionCounter).padStart(8, '0')}1`})`,
  );
  return id;
}

export async function insertTag(prisma: PrismaClient, s: DashboardSetup, name: string): Promise<string> {
  const id = randomUUID();
  await withTenantContext(prisma, s.workspaceId, (tx) =>
    tx.$executeRaw`INSERT INTO tag (id, project_id, workspace_id, name, color)
      VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${name}, 'blue')`,
  );
  return id;
}

/** An execution in `status`, directly in the database. */
export async function insertExecution(prisma: PrismaClient, s: DashboardSetup, status = 'Completed', createdDaysAgo = 0): Promise<string> {
  const id = randomUUID();
  await withTenantContext(prisma, s.workspaceId, (tx) =>
    tx.$executeRaw`INSERT INTO test_execution (id, project_id, workspace_id, name, status, browser, viewport_width,
        viewport_height, locale, timezone, created_by, created_at)
      VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${`Exec ${id.slice(0, 4)}`}, ${status},
        'Chromium', 1280, 720, 'en-US', 'UTC', ${s.creator}::uuid, ${daysAgo(createdDaysAgo)})`,
  );
  return id;
}

export interface RunSpec {
  testCaseId: string;
  outcome: Outcome;
  /** When the outcome was recorded; ignored for Pending. */
  daysAgo?: number;
  /** When the run was added; defaults to `daysAgo` (or now). */
  addedDaysAgo?: number;
  /** An exact outcome time, overriding `daysAgo`. */
  at?: Date;
  /** Outcomes of earlier attempts of this run, oldest first. */
  earlierAttempts?: Outcome[];
}

/** Runs of one execution, in order. Returns their ids. */
export async function insertRuns(prisma: PrismaClient, s: DashboardSetup, executionId: string, runs: RunSpec[]): Promise<string[]> {
  const ids: string[] = [];
  await withTenantContext(prisma, s.workspaceId, async (tx) => {
    for (const [index, run] of runs.entries()) {
      const id = randomUUID();
      const outcomeAt = run.outcome === 'Pending' ? null : (run.at ?? daysAgo(run.daysAgo ?? 1));
      const addedAt = daysAgo(run.addedDaysAgo ?? run.daysAgo ?? 0);
      await tx.$executeRaw`INSERT INTO test_run (id, execution_id, workspace_id, test_case_id, position, outcome,
          outcome_updated_at, created_at)
        VALUES (${id}::uuid, ${executionId}::uuid, ${s.workspaceId}::uuid, ${run.testCaseId}::uuid, ${index + 1}, ${run.outcome},
          ${outcomeAt}, ${addedAt})`;
      for (const [attempt, outcome] of (run.earlierAttempts ?? []).entries()) {
        await tx.$executeRaw`INSERT INTO test_run_attempt (workspace_id, execution_id, test_run_id, test_case_id, attempt,
            position, outcome, outcome_updated_at)
          VALUES (${s.workspaceId}::uuid, ${executionId}::uuid, ${id}::uuid, ${run.testCaseId}::uuid, ${attempt + 1},
            ${index + 1}, ${outcome}, ${outcome === 'Pending' ? null : addedAt})`;
      }
      ids.push(id);
    }
    if ((runs[0]?.earlierAttempts?.length ?? 0) > 0) {
      await tx.$executeRaw`UPDATE test_execution SET attempt = ${runs[0].earlierAttempts!.length + 1} WHERE id = ${executionId}::uuid`;
    }
  });
  return ids;
}

/** One run per new execution (a test case runs once per execution), newest outcome last. */
export async function insertRunHistory(
  prisma: PrismaClient,
  s: DashboardSetup,
  testCaseId: string,
  history: { outcome: Outcome; daysAgo: number }[],
): Promise<void> {
  for (const run of history) {
    await insertRuns(prisma, s, await insertExecution(prisma, s), [{ testCaseId, outcome: run.outcome, daysAgo: run.daysAgo }]);
  }
}

/** Puts a row in the Trash as its delete would (deleted_at and deleted_by). */
export async function trash(prisma: PrismaClient, s: DashboardSetup, table: 'test_case' | 'test_execution', id: string): Promise<void> {
  await withTenantContext(prisma, s.workspaceId, (tx) =>
    tx.$executeRawUnsafe(`UPDATE ${table} SET deleted_at = now(), deleted_by = $1::uuid WHERE id = $2::uuid`, s.creator, id),
  );
}
