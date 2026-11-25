import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { withTenantContext } from '../src/common/tenant-context';
import { provisionIdentity } from '../src/common/provision-identity';
import { decrypt } from '../src/common/secrets-encryption';
import { PrismaService } from '../src/common/prisma.service';
import { SeedConflictError, SeedTargetError, seedDemo, seedUuid } from '../src/seed/demo-seed';
import { BUGS, TAGS, TEAMMATES, TEST_CASES } from '../src/seed/demo-dataset';
import { backlogAgeSplit, bugTagCounts, needsAttention, type BugDashboardData } from '@railgun-qa/reporting';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest.fn(async (clerkUserId: string) => ({
        emailAddresses: [{ emailAddress: `${clerkUserId}@example.com` }],
        firstName: 'Seed',
        lastName: 'Owner',
      })),
    },
  })),
}));

import { AppModule } from '../src/app.module';

const DAY_MS = 86_400_000;

describe('demo seed (e2e, specs/demo-seed)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  // seedDemo takes the app's PrismaService, like the CLI.
  let service: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    service = new PrismaService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await service.$disconnect();
  });

  async function signedInUser(label: string) {
    const clerkUserId = `clerk-seed-${label}-${randomUUID()}`;
    const identity = await provisionIdentity(prisma, clerkUserId, `${label}@example.com`, 'Seed Owner');
    return { clerkUserId, ...identity };
  }

  async function countRows(workspaceId: string): Promise<Record<string, number>> {
    return withTenantContext(prisma, workspaceId, async (tx) => {
      const counts: Record<string, number> = {};
      for (const table of ['folder', 'tag', 'bug_tag', 'test_case', 'environment', 'environment_credential', 'test_execution', 'test_run', 'bug', 'activity_entries', 'project_membership']) {
        const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${table}`);
        counts[table] = Number(row.n);
      }
      return counts;
    });
  }

  const get = (token: string, path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  describe('seeding a user with existing data', () => {
    let user: Awaited<ReturnType<typeof signedInUser>>;
    let existingFolderId: string;
    let existingCaseId: string;
    let otherWorkspace: { workspaceId: string; projectId: string };
    let otherBefore: Record<string, number>;
    let firstRunCounts: Record<string, number>;

    beforeAll(async () => {
      user = await signedInUser('main');
      existingFolderId = randomUUID();
      existingCaseId = randomUUID();
      await withTenantContext(prisma, user.workspaceId, async (tx) => {
        await tx.$executeRaw`INSERT INTO folder (id, project_id, workspace_id, name, position_key)
          VALUES (${existingFolderId}::uuid, ${user.projectId}::uuid, ${user.workspaceId}::uuid, 'Existing', 'i')`;
        await tx.$executeRaw`INSERT INTO test_case (id, project_id, workspace_id, name, status, position_key)
          VALUES (${existingCaseId}::uuid, ${user.projectId}::uuid, ${user.workspaceId}::uuid, 'Mine', 'Ready', 'i')`;
      });
      otherWorkspace = await createWorkspaceWithProject(prisma, `Seed-Other-${randomUUID().slice(0, 8)}`);
      otherBefore = await countRows(otherWorkspace.workspaceId);

      const result = await seedDemo(service, user.clerkUserId);
      expect(result.status).toBe('seeded');
      expect(result.counts).toMatchObject({ teammates: 2, executions: 8, environments: 2, credentials: 3 });
      expect(result.counts!.testCases).toBeGreaterThanOrEqual(25);
      firstRunCounts = await countRows(user.workspaceId);
    });

    it('lists executions in all six statuses, with counts matching their runs', async () => {
      const list = await get(user.clerkUserId, `/projects/${user.projectId}/executions`);
      expect(list.status).toBe(200);
      const seeded = (list.body as { status: string; id: string; counts: Record<string, number> }[]);
      expect([...new Set(seeded.map((e) => e.status))].sort()).toEqual(['Completed', 'Done', 'Draft', 'InProgress', 'Paused', 'Ready']);

      for (const summary of seeded) {
        const detail = await get(user.clerkUserId, `/projects/${user.projectId}/executions/${summary.id}`);
        const runs = detail.body.runs as { outcome: string }[];
        const n = (o: string) => runs.filter((r) => r.outcome === o).length;
        expect(summary.counts).toEqual({ total: runs.length, done: runs.length - n('Pending'), pass: n('Pass'), fail: n('Fail'), needsReview: n('NeedsReview') });
      }
    });

    it('started executions carry snapshots and timers; Done is signed off', async () => {
      const list = (await get(user.clerkUserId, `/projects/${user.projectId}/executions`)).body as { id: string; status: string }[];
      const detail = async (status: string) =>
        (await get(user.clerkUserId, `/projects/${user.projectId}/executions/${list.find((e) => e.status === status)!.id}`)).body;

      const live = await detail('InProgress');
      expect(live.lastResumedAt).not.toBeNull();
      expect(live.elapsedMsAccumulated).toBeGreaterThan(0);
      expect(live.runs.every((r: { gherkinScript: string | null }) => r.gherkinScript !== null)).toBe(true);
      const paused = await detail('Paused');
      expect(paused).toMatchObject({ lastResumedAt: null });
      expect(paused.elapsedMsAccumulated).toBeGreaterThan(0);
      const done = await detail('Done');
      expect(done.signedOffBy).toBe(user.userId);
      expect(done.signedOffAt).not.toBeNull();
      const draft = await detail('Draft');
      expect(draft).toMatchObject({ startedAt: null, elapsedMsAccumulated: 0 });
    });

    it('bugs are mostly filed from failed runs, with failed steps from the script', async () => {
      const bugs = (await get(user.clerkUserId, `/projects/${user.projectId}/bugs`)).body as {
        run: { outcome: string } | null;
        failedStep: string | null;
        gherkinSnapshot: string | null;
        autoCreated: boolean;
        severity: string;
        status: string;
      }[];
      const linked = bugs.filter((b) => b.run);
      expect(linked.length).toBeGreaterThan(bugs.length / 2);
      expect(linked.every((b) => b.run!.outcome === 'Fail')).toBe(true);
      for (const bug of linked.filter((b) => b.failedStep)) {
        expect(bug.gherkinSnapshot!.split('\n').map((l) => l.trim())).toContain(bug.failedStep);
      }
      expect(bugs.some((b) => b.autoCreated)).toBe(true);
      expect(new Set(bugs.map((b) => b.severity)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(bugs.map((b) => b.status)).size).toBeGreaterThanOrEqual(4);
    });

    it('resolved bugs carry a resolution date at their seeded status change; open ones none', async () => {
      const bugs = (await get(user.clerkUserId, `/projects/${user.projectId}/bugs`)).body as {
        id: string;
        status: string;
        resolvedAt: string | null;
      }[];
      const changes = await withTenantContext(service, user.workspaceId, (tx) =>
        tx.$queryRaw<{ entity_id: string; created_at: Date }[]>`
          SELECT entity_id, created_at FROM activity_entries
          WHERE project_id = ${user.projectId}::uuid AND action_code = 'bug.updated'`,
      );
      const changedAt = new Map(changes.map((c) => [c.entity_id, c.created_at.toISOString()]));
      const resolved = bugs.filter((b) => ['Resolved', 'Closed', 'WontFix'].includes(b.status));

      expect(resolved.length).toBeGreaterThan(0);
      for (const bug of resolved) {
        expect(bug.resolvedAt).toBe(changedAt.get(bug.id));
      }
      expect(bugs.filter((b) => !resolved.includes(b)).every((b) => b.resolvedAt === null)).toBe(true);
    });

    it('seeded credentials decrypt with the workspace key', async () => {
      const rows = await withTenantContext(prisma, user.workspaceId, (tx) =>
        tx.$queryRaw<{ id: string; password_ciphertext: string }[]>`SELECT id, password_ciphertext FROM environment_credential`,
      );
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(await decrypt(prisma, user.workspaceId, row.id, row.password_ciphertext)).toMatch(/^Demo-/);
      }
    });

    it('test cases show their last outcome; existing items are kept and come first', async () => {
      const cases = (await get(user.clerkUserId, `/projects/${user.projectId}/test-cases`)).body as {
        id: string;
        name: string;
        lastOutcome: string | null;
      }[];
      expect(cases.find((c) => c.id === existingCaseId)).toMatchObject({ name: 'Mine', lastOutcome: null });
      expect(cases.find((c) => c.name === 'Sign in with valid credentials')!.lastOutcome).toBe('Pass');

      const roots = await withTenantContext(prisma, user.workspaceId, (tx) =>
        tx.$queryRaw<{ id: string; name: string }[]>`
          SELECT id, name FROM folder WHERE parent_folder_id IS NULL ORDER BY position_key, id`,
      );
      expect(roots.map((f) => f.name)).toEqual(['Existing', 'ShopFlow']);
    });

    it('test cases carry edit times: the script edit, else creation (ADR 0025)', async () => {
      const cases = (await get(user.clerkUserId, `/projects/${user.projectId}/test-cases`)).body as {
        name: string;
        createdAt: string;
        updatedAt: string;
        scriptUpdatedAt: string | null;
      }[];
      const daysAgo = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / DAY_MS);
      for (const t of TEST_CASES) {
        const row = cases.find((c) => c.name === t.name)!;
        expect(daysAgo(row.createdAt)).toBe(Math.round(t.createdDaysAgo));
        if (t.scriptEdit) {
          expect(daysAgo(row.scriptUpdatedAt!)).toBe(t.scriptEdit.daysAgo);
          expect(row.updatedAt).toBe(row.scriptUpdatedAt);
        } else {
          expect(row.updatedAt).toBe(row.createdAt);
          expect(row.scriptUpdatedAt).toBeNull();
        }
      }
    });

    it('seeded script edits are in the Test Cases history, and earlier runs and bugs keep the old script', async () => {
      const editedCases = TEST_CASES.filter((t) => t.scriptEdit);
      const feed = (await get(user.clerkUserId, `/projects/${user.projectId}/activity?type=test-cases`)).body as {
        entries: { actorName: string; actionCode: string; entityName: string; details: Record<string, unknown>; createdAt: string }[];
      };
      for (const t of editedCases) {
        const entry = feed.entries.find((e) => e.actionCode === 'test_case.updated' && e.entityName === t.name);
        expect(entry).toBeDefined();
        expect(entry!.details).toEqual({ changes: { gherkinScript: true } });
        expect(Math.round((Date.now() - Date.parse(entry!.createdAt)) / DAY_MS)).toBe(t.scriptEdit!.daysAgo);
        expect(entry!.actorName).toBe(
          t.scriptEdit!.by === 'owner' ? 'Seed Owner' : TEAMMATES.find((m) => m.key === 'contributor')!.displayName,
        );
      }

      const list = (await get(user.clerkUserId, `/projects/${user.projectId}/executions`)).body as { id: string; name: string }[];
      const smoke = (await get(user.clerkUserId, `/projects/${user.projectId}/executions/${list.find((e) => e.name === 'Payments smoke')!.id}`))
        .body as { runs: { testCaseId: string; gherkinScript: string | null }[] };
      for (const t of editedCases) {
        const run = smoke.runs.find((r) => r.testCaseId === seedUuid(`${user.workspaceId}:test_case:${t.key}`));
        expect(run?.gherkinScript).toBe(t.scriptEdit!.previousGherkin);
      }

      const bugs = (await get(user.clerkUserId, `/projects/${user.projectId}/bugs`)).body as { id: string; title: string }[];
      const threeDs = bugs.find((b) => b.title === 'Pay with a card requiring 3-D Secure')!;
      const bug = (await get(user.clerkUserId, `/projects/${user.projectId}/bugs/${threeDs.id}`)).body as { gherkinSnapshot: string };
      expect(bug.gherkinSnapshot).toBe(TEST_CASES.find((t) => t.key === 'card-3ds')!.scriptEdit!.previousGherkin);
    });

    it('the seeded runs fill Top Failing on the dashboard and the Overview, leaving 2 unranked (design.md decision 7)', async () => {
      const dashboard = (await get(user.clerkUserId, `/projects/${user.projectId}/test-cases/dashboard?tz=UTC`)).body;
      const expected = [
        ['Account locks after five failed sign-ins', 100],
        ['Search with no results suggests alternatives', 67],
        ['Reset password by email link', 33],
      ];
      expect(dashboard.rankings.topFailing.map((r: { name: string; failRatePct: number }) => [r.name, r.failRatePct])).toEqual(expected);
      expect(dashboard.rankings.failingBelowMinimum).toBe(2);

      const overview = (await get(user.clerkUserId, `/projects/${user.projectId}/overview`)).body;
      expect(overview.topFailingTests.map((r: { name: string; failRatePct: number }) => [r.name, r.failRatePct])).toEqual(expected);
      expect(overview.failingBelowMinimum).toBe(2);
    });

    it('the seeded script edits show Trend Reset on their test cases (specs/demo-seed)', async () => {
      for (const t of TEST_CASES.filter((c) => c.scriptEdit)) {
        const id = seedUuid(`${user.workspaceId}:test_case:${t.key}`);
        const detail = (await get(user.clerkUserId, `/projects/${user.projectId}/test-cases/${id}`)).body as { health: { flags: string[] } };
        expect(detail.health.flags).toContain('TrendReset');
      }
    });

    it('the Bugs dashboard shows the idle bug in Needs Attention and Backlog Age, and tags in uneven numbers', async () => {
      const response = await get(user.clerkUserId, `/projects/${user.projectId}/bugs/dashboard?tz=UTC`);
      expect(response.status).toBe(200);
      const data = response.body as BugDashboardData;
      const idleId = seedUuid(`${user.workspaceId}:bug:order-email-currency`);

      const idle = needsAttention(data).find((row) => row.bug.id === idleId);
      expect(idle).toMatchObject({ idle: true, unattended: false });
      expect(backlogAgeSplit(data).Old).toBe(1);

      const counts = bugTagCounts(data).map((t) => t.count);
      expect(counts).toHaveLength(TAGS.length);
      expect(Math.max(...counts)).toBeGreaterThanOrEqual(3);
      expect(counts).toContain(1);
    });

    it('filtering the bug list by a seeded tag returns exactly the bugs carrying it', async () => {
      const list = (await get(user.clerkUserId, `/projects/${user.projectId}/bugs`)).body as { id: string; tagIds: string[] }[];
      const authId = seedUuid(`${user.workspaceId}:tag:auth`);
      const expected = BUGS.filter((b) => b.tagKeys?.includes('auth')).map((b) => seedUuid(`${user.workspaceId}:bug:${b.key}`));
      expect(list.filter((b) => b.tagIds.includes(authId)).map((b) => b.id).sort()).toEqual(expected.sort());
    });

    it("logs tag creation, and names the tags in each tagged bug's filing entry", async () => {
      const entries = await withTenantContext(prisma, user.workspaceId, (tx) =>
        tx.$queryRaw<{ action_code: string; entity_id: string; details: { tags?: string[] } | null }[]>`
          SELECT action_code, entity_id, details FROM activity_entries WHERE action_code IN ('tag.created', 'bug.created')`,
      );
      expect(entries.filter((e) => e.action_code === 'tag.created')).toHaveLength(TAGS.length);
      const filing = entries.find((e) => e.entity_id === seedUuid(`${user.workspaceId}:bug:three-ds-auto`))!;
      expect(filing.details?.tags?.sort()).toEqual(['checkout', 'payments']);
    });

    it('history spans weeks and more than one person', async () => {
      const entries = await withTenantContext(prisma, user.workspaceId, (tx) =>
        tx.$queryRaw<{ actor_user_id: string; created_at: Date }[]>`SELECT actor_user_id, created_at FROM activity_entries`,
      );
      const times = entries.map((e) => e.created_at.getTime());
      expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(14 * DAY_MS);
      expect(new Set(entries.map((e) => e.actor_user_id)).size).toBeGreaterThan(1);
    });

    it('a second run reports already-present and changes nothing', async () => {
      const again = await seedDemo(service, user.clerkUserId);

      expect(again.status).toBe('already-present');
      expect(await countRows(user.workspaceId)).toEqual(firstRunCounts);
    });

    it("another workspace's rows are untouched", async () => {
      expect(await countRows(otherWorkspace.workspaceId)).toEqual(otherBefore);
    });
  });

  it('a clashing root folder name aborts and writes nothing', async () => {
    const user = await signedInUser('clash');
    await withTenantContext(prisma, user.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO folder (id, project_id, workspace_id, name, position_key)
        VALUES (${randomUUID()}::uuid, ${user.projectId}::uuid, ${user.workspaceId}::uuid, 'shopflow', 'i')`,
    );
    const before = await countRows(user.workspaceId);

    await expect(seedDemo(service, user.clerkUserId)).rejects.toThrow(SeedConflictError);
    expect(await countRows(user.workspaceId)).toEqual(before);
    const teammate = await prisma.$transaction(async (tx) => {
      const teammateId = seedUuid(`${user.workspaceId}:user:contributor`);
      await tx.$executeRaw`SELECT set_config('app.user_id', ${teammateId}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM "user" WHERE id = ${teammateId}::uuid`;
    });
    expect(teammate).toEqual([]);
  });

  it('a clashing tag name aborts and writes nothing', async () => {
    const user = await signedInUser('tag-clash');
    await withTenantContext(prisma, user.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO tag (id, project_id, workspace_id, name, color)
        VALUES (${randomUUID()}::uuid, ${user.projectId}::uuid, ${user.workspaceId}::uuid, 'Checkout', 'gray')`,
    );
    const before = await countRows(user.workspaceId);

    await expect(seedDemo(service, user.clerkUserId)).rejects.toThrow(SeedConflictError);
    expect(await countRows(user.workspaceId)).toEqual(before);
  });

  it('a Clerk id that never signed in is refused', async () => {
    await expect(seedDemo(service, `clerk-never-${randomUUID()}`)).rejects.toThrow(SeedTargetError);
  });
});
