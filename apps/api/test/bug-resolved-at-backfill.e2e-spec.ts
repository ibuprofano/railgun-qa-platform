import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { insertTestUser } from './helpers/membership-fixtures';
import { withTenantContext } from '../src/common/tenant-context';

/**
 * Migration 0016's backfill (specs/bug-tracking: existing resolved bugs get a resolution
 * date). Migrations are plain SQL, so this runs the migration's own backfill statement,
 * cut from the file between its markers, against fixture rows in one tenant context.
 */
const MIGRATION = readFileSync(join(__dirname, '../../../db/migrations/0016_bug_resolved_at.up.sql'), 'utf8');
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf('-- backfill:begin'), MIGRATION.indexOf('-- backfill:end'))
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('bug resolved_at backfill (e2e, migration 0016)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dates each resolved bug by its logged move into the resolved set, else its last update', async () => {
    const f = await createWorkspaceWithProject(prisma, `Backfill-${randomUUID().slice(0, 8)}`);
    const reporter = await insertTestUser(prisma, `clerk-backfill-${randomUUID()}`, 'Reporter');
    const march = (day: number) => new Date(Date.UTC(2026, 2, day, 10));
    const placeholder = new Date(0); // the check needs a date on resolved rows until the backfill sets it
    const ids = { history: randomUUID(), noHistory: randomUUID(), open: randomUUID() };

    await withTenantContext(prisma, f.workspaceId, async (tx) => {
      const bug = (id: string, title: string, status: string, resolvedAt: Date | null, updatedAt: Date) => tx.$executeRaw`
        INSERT INTO bug (id, project_id, workspace_id, title, severity, status, reporter_id, reporter_display_name,
          created_at, updated_at, resolved_at)
        VALUES (${id}::uuid, ${f.projectId}::uuid, ${f.workspaceId}::uuid, ${title}, 'High', ${status},
          ${reporter}::uuid, 'Reporter', ${march(1)}, ${updatedAt}, ${resolvedAt})`;
      await bug(ids.history, 'With history', 'Closed', placeholder, march(5));
      await bug(ids.noHistory, 'No history', 'Resolved', placeholder, march(7));
      await bug(ids.open, 'Still open', 'Open', null, march(8));

      const change = (from: string, to: string, at: Date) => tx.$executeRaw`
        INSERT INTO activity_entries (workspace_id, project_id, action_code, entity_type, entity_id, entity_name,
          category, details, created_at)
        VALUES (${f.workspaceId}::uuid, ${f.projectId}::uuid, 'bug.updated', 'bug', ${ids.history}::uuid,
          'With history', 'Bugs', ${JSON.stringify({ changes: { status: { from, to } } })}::jsonb, ${at})`;
      await change('Open', 'Resolved', march(3));
      await change('Resolved', 'Closed', march(5)); // moving within the set keeps 3 March

      await tx.$executeRawUnsafe(BACKFILL);
    });

    const rows = await withTenantContext(prisma, f.workspaceId, (tx) =>
      tx.$queryRaw<{ id: string; resolved_at: Date | null }[]>`
        SELECT id, resolved_at FROM bug WHERE id = ANY(${Object.values(ids)}::uuid[])`,
    );
    const resolvedAt = Object.fromEntries(rows.map((row) => [row.id, row.resolved_at?.toISOString() ?? null]));
    expect(resolvedAt[ids.history]).toBe(march(3).toISOString());
    expect(resolvedAt[ids.noHistory]).toBe(march(7).toISOString());
    expect(resolvedAt[ids.open]).toBeNull();
  });

  it('the database refuses a resolution date out of step with the status', async () => {
    const f = await createWorkspaceWithProject(prisma, `Backfill-Check-${randomUUID().slice(0, 8)}`);
    const reporter = await insertTestUser(prisma, `clerk-backfill-${randomUUID()}`, 'Reporter');

    const insert = (status: string, resolvedAt: Date | null) =>
      withTenantContext(prisma, f.workspaceId, (tx) => tx.$executeRaw`
        INSERT INTO bug (project_id, workspace_id, title, severity, status, reporter_id, reporter_display_name, resolved_at)
        VALUES (${f.projectId}::uuid, ${f.workspaceId}::uuid, 'X', 'Low', ${status}, ${reporter}::uuid, 'Reporter', ${resolvedAt})`);

    await expect(insert('Resolved', null)).rejects.toThrow(/bug_resolved_at_matches_status/);
    await expect(insert('Open', new Date())).rejects.toThrow(/bug_resolved_at_matches_status/);
  });
});
