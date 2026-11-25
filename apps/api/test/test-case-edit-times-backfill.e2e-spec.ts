import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { withTenantContext } from '../src/common/tenant-context';

/**
 * Migration 0018's backfill (specs/test-case-authoring: existing test cases get edit times
 * from their history). Migrations are plain SQL, so this runs the migration's own backfill
 * statement, cut from the file between its markers, against fixture rows in one tenant
 * context, as bug-resolved-at-backfill.e2e-spec.ts does for 0016.
 */
const MIGRATION = readFileSync(join(__dirname, '../../../db/migrations/0018_test_case_edit_times.up.sql'), 'utf8');
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf('-- backfill:begin'), MIGRATION.indexOf('-- backfill:end'))
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('test case edit times backfill (e2e, migration 0018)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('takes the change time from the latest update or move, and the script time from the latest script change', async () => {
    const f = await createWorkspaceWithProject(prisma, `TC-Backfill-${randomUUID().slice(0, 8)}`);
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    const ids = { edited: randomUUID(), untouched: randomUUID() };
    const created = daysAgo(10);

    await withTenantContext(prisma, f.workspaceId, async (tx) => {
      for (const [id, name] of [[ids.edited, 'Edited'], [ids.untouched, 'Untouched']]) {
        // Stale values stand in for whatever the columns held before the backfill.
        await tx.$executeRaw`
          INSERT INTO test_case (id, project_id, workspace_id, name, position_key, created_at, updated_at, script_updated_at)
          VALUES (${id}::uuid, ${f.projectId}::uuid, ${f.workspaceId}::uuid, ${name}, 'a0', ${created}, now(), now())`;
      }
      const entry = (actionCode: string, details: Record<string, unknown>, at: Date) => tx.$executeRaw`
        INSERT INTO activity_entries (workspace_id, project_id, action_code, entity_type, entity_id, entity_name,
          category, details, created_at)
        VALUES (${f.workspaceId}::uuid, ${f.projectId}::uuid, ${actionCode}, 'test_case', ${ids.edited}::uuid,
          'Edited', 'Test Cases', ${JSON.stringify(details)}::jsonb, ${at})`;
      await entry('test_case.created', { folderId: null, tags: [] }, created);
      await entry('test_case.updated', { changes: { gherkinScript: true } }, daysAgo(6));
      await entry('test_case.updated', { changes: { status: { from: 'Draft', to: 'Ready' } } }, daysAgo(4));
      await entry('test_case.moved', { fromFolderId: null, toFolderId: null }, daysAgo(2));

      await tx.$executeRawUnsafe(BACKFILL);
    });

    const rows = await withTenantContext(prisma, f.workspaceId, (tx) =>
      tx.$queryRaw<{ id: string; updated_at: Date; script_updated_at: Date | null }[]>`
        SELECT id, updated_at, script_updated_at FROM test_case WHERE id = ANY(${Object.values(ids)}::uuid[])`,
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    const day = (date: Date | null) => (date ? Math.round((Date.now() - date.getTime()) / 86_400_000) : null);

    expect(day(byId[ids.edited].updated_at)).toBe(2);
    expect(day(byId[ids.edited].script_updated_at)).toBe(6);
    expect(byId[ids.untouched].updated_at.toISOString()).toBe(created.toISOString());
    expect(byId[ids.untouched].script_updated_at).toBeNull();
  });
});
