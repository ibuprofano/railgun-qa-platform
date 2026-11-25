import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { setUpProjectMember } from './helpers/execution-fixtures';
import {
  type DashboardSetup,
  insertExecution,
  insertFolder,
  insertRunHistory,
  insertRuns,
  insertTag,
  insertTestCase,
  setUpDashboardProject,
  trash,
} from './helpers/dashboard-fixtures';
import { withTenantContext } from '../src/common/tenant-context';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest.fn(async (clerkUserId: string) => ({
        emailAddresses: [{ emailAddress: `${clerkUserId}@example.com` }],
        firstName: 'Test',
        lastName: 'User',
      })),
    },
  })),
}));

import { AppModule } from '../src/app.module';

describe('Test Cases dashboard (e2e, specs/test-case-metrics)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const read = (s: DashboardSetup, tz = 'UTC', token = s.viewer) =>
    request(app.getHttpServer()).get(`/projects/${s.projectId}/test-cases/dashboard?tz=${encodeURIComponent(tz)}`).set(as(token));
  const body = async (s: DashboardSetup, tz = 'UTC') => {
    const response = await read(s, tz);
    expect(response.status).toBe(200);
    return response.body;
  };
  const setUp = (label: string) => setUpDashboardProject(prisma, label);

  describe('access and scope', () => {
    it('a Viewer reads every section; a member of another workspace gets 403', async () => {
      const s = await setUp('Dash-Access');
      await insertTestCase(prisma, s, { name: 'One' });
      const other = await createWorkspaceWithProject(prisma, 'Dash-Other');
      const outsider = await setUpProjectMember(prisma, other.workspaceId, other.projectId, 'Admin');

      const dashboard = await body(s);
      expect(Object.keys(dashboard).sort()).toEqual(
        ['days', 'folderHealth', 'hasCompletedRuns', 'lastOutcome', 'needsAttention', 'rankings', 'sourceType', 'tiles'].sort(),
      );
      expect((await read(s, 'UTC', outsider)).status).toBe(403);
    });

    it('is not read as a test case id', async () => {
      const s = await setUp('Dash-Route');
      const response = await read(s);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tiles');
    });

    it('leaves out trashed test cases, and counts a trashed execution run as never run', async () => {
      const s = await setUp('Dash-Trash');
      const gone = await insertTestCase(prisma, s, { name: 'Gone' });
      await insertRunHistory(prisma, s, gone, [{ outcome: 'Fail', daysAgo: 1 }, { outcome: 'Fail', daysAgo: 2 }, { outcome: 'Fail', daysAgo: 3 }]);
      await trash(prisma, s, 'test_case', gone);
      const kept = await insertTestCase(prisma, s, { name: 'Kept' });
      const execution = await insertExecution(prisma, s);
      await insertRuns(prisma, s, execution, [{ testCaseId: kept, outcome: 'Pass', daysAgo: 1 }]);
      await trash(prisma, s, 'test_execution', execution);

      const d = await body(s);

      expect(d.tiles).toMatchObject({ total: 1, covered: 0 });
      expect(d.lastOutcome).toEqual({ pass: 0, fail: 0, needsReview: 0, neverRun: 1 });
      expect(d.needsAttention.map((r: { name: string }) => r.name)).toEqual(['Kept']);
      expect(d.rankings.topFailing).toEqual([]);
      expect(d.rankings.mostRun).toEqual([]);
    });
  });

  describe('tiles and series', () => {
    it('reports 10 / 6 / 7 / no confidence, equal to the Overview', async () => {
      const s = await setUp('Dash-Tiles');
      for (let i = 0; i < 10; i++) {
        const id = await insertTestCase(prisma, s, { name: `T${i}`, status: i < 6 ? 'Ready' : 'Draft' });
        if (i < 7) await insertRunHistory(prisma, s, id, [{ outcome: 'Pass', daysAgo: 1 }]);
      }

      const d = await body(s);
      const overview = (await request(app.getHttpServer()).get(`/projects/${s.projectId}/overview`).set(as(s.viewer))).body;

      expect(d.tiles).toEqual({ total: 10, ready: 6, covered: 7, avgConfidencePct: null });
      expect(overview.testCases).toEqual({ total: 10, readyPct: 60, coveragePct: 70 });
    });

    it("counts one day's created, added, completed and passed", async () => {
      const s = await setUp('Dash-Day');
      const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 3, 12));
      const dayAgo = (Date.now() - day.getTime()) / 86_400_000;
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await insertTestCase(prisma, s, { name: `D${i}`, createdDaysAgo: i < 2 ? dayAgo : 40 }));
      const execution = await insertExecution(prisma, s);
      const outcomes = ['Pass', 'Pass', 'Fail', 'Pending', 'Pending'] as const;
      await insertRuns(
        prisma,
        s,
        execution,
        ids.map((testCaseId, i) => ({ testCaseId, outcome: outcomes[i], at: day, addedDaysAgo: dayAgo })),
      );

      const d = await body(s);
      const entry = d.days.find((x: { date: string }) => x.date === day.toISOString().slice(0, 10));

      expect(d.days).toHaveLength(90);
      expect(entry).toEqual({ date: day.toISOString().slice(0, 10), created: 2, added: 5, completed: 3, passed: 2 });
      expect(d.hasCompletedRuns).toBe(true);
    });

    it('counts a 23:30 UTC run on the next day in Europe/Madrid', async () => {
      const s = await setUp('Dash-Tz');
      const tc = await insertTestCase(prisma, s, { name: 'Late' });
      const now = new Date();
      const late = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 5, 23, 30));
      await insertRuns(prisma, s, await insertExecution(prisma, s), [{ testCaseId: tc, outcome: 'Pass', at: late }]);

      const d = await body(s, 'Europe/Madrid');
      const next = new Date(late.getTime() + 86_400_000).toISOString().slice(0, 10);

      expect(d.days.find((x: { date: string }) => x.date === next).completed).toBe(1);
      expect(d.days.find((x: { date: string }) => x.date === late.toISOString().slice(0, 10)).completed).toBe(0);
    });

    it('rejects an unknown zone, and reports no completed runs', async () => {
      const s = await setUp('Dash-NoRuns');
      await insertTestCase(prisma, s, { name: 'Idle' });

      expect((await read(s, 'Mars/Olympus')).status).toBe(400);
      expect((await body(s)).hasCompletedRuns).toBe(false);
    });
  });

  describe('splits', () => {
    it('counts last outcomes and source types', async () => {
      const s = await setUp('Dash-Splits');
      const failed = await insertTestCase(prisma, s, { name: 'Failed last' });
      await insertRunHistory(prisma, s, failed, [{ outcome: 'Pass', daysAgo: 3 }, { outcome: 'Fail', daysAgo: 1 }]);
      const pending = await insertTestCase(prisma, s, { name: 'Pending only', script: null });
      await insertRuns(prisma, s, await insertExecution(prisma, s, 'Ready'), [{ testCaseId: pending, outcome: 'Pending' }]);

      const d = await body(s);

      expect(d.lastOutcome).toEqual({ pass: 0, fail: 1, needsReview: 0, neverRun: 1 });
      expect(d.sourceType).toEqual({ gherkin: 1, manual: 1 });
    });
  });

  describe('Needs Attention', () => {
    it('lists each flagged test case once with all its issues, oldest first, and leaves out healthy ones', async () => {
      const s = await setUp('Dash-Needs');
      const both = await insertTestCase(prisma, s, { name: 'Bare', script: null, createdDaysAgo: 20 });
      const healthy = await insertTestCase(prisma, s, { name: 'Healthy', createdDaysAgo: 30 });
      await insertRunHistory(prisma, s, healthy, [{ outcome: 'Pass', daysAgo: 1 }]);
      const dormant = await insertTestCase(prisma, s, { name: 'Dormant', createdDaysAgo: 40 });
      await insertRunHistory(prisma, s, dormant, [{ outcome: 'Pass', daysAgo: 20 }]);

      const d = await body(s);

      expect(d.needsAttention.map((r: { id: string; issues: string[] }) => [r.id, r.issues])).toEqual([
        [dormant, ['Dormant']],
        [both, ['NoScript', 'Orphan']],
      ]);
      expect(d.needsAttention[1]).toMatchObject({ name: 'Bare', status: 'Ready', tagIds: [], createdAt: expect.any(String), updatedAt: expect.any(String) });

      const detail = (await request(app.getHttpServer()).get(`/projects/${s.projectId}/test-cases/${dormant}`).set(as(s.viewer))).body;
      expect(detail.health.flags).toEqual(['Dormant']);
    });

    it('does not count Improving or Trend Reset as issues', async () => {
      const s = await setUp('Dash-NotIssues');
      const improving = await insertTestCase(prisma, s, { name: 'Improving' });
      const outcomes = ['Fail', 'Fail', 'Fail', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass'] as const;
      await insertRunHistory(prisma, s, improving, outcomes.map((outcome, i) => ({ outcome, daysAgo: 10 - i })));
      const reset = await insertTestCase(prisma, s, { name: 'Reset', scriptEditedDaysAgo: 2 });
      await insertRunHistory(prisma, s, reset, [{ outcome: 'Pass', daysAgo: 3 }]);

      expect((await body(s)).needsAttention).toEqual([]);
    });
  });

  describe('rankings', () => {
    it('ranks Top Failing by exact fail rate with at least 3 runs', async () => {
      const s = await setUp('Dash-Failing');
      const history = (fails: number, total: number) =>
        Array.from({ length: total }, (_, i) => ({ outcome: (i < fails ? 'Fail' : 'Pass') as 'Fail' | 'Pass', daysAgo: i + 1 }));
      const a = await insertTestCase(prisma, s, { name: 'A' });
      await insertRunHistory(prisma, s, a, history(3, 4));
      const b = await insertTestCase(prisma, s, { name: 'B' });
      await insertRunHistory(prisma, s, b, history(1, 2));
      const c = await insertTestCase(prisma, s, { name: 'C' });
      await insertRunHistory(prisma, s, c, history(2, 10));

      const { topFailing, mostRun } = (await body(s)).rankings;

      expect(topFailing).toEqual([
        { id: a, name: 'A', failed: 3, completed: 4, failRatePct: 75 },
        { id: c, name: 'C', failed: 2, completed: 10, failRatePct: 20 },
      ]);
      expect(mostRun.map((r: { name: string; completed: number }) => [r.name, r.completed])).toEqual([['C', 10], ['A', 4], ['B', 2]]);
    });

    it('counts failing test cases below the 3-run minimum', async () => {
      const s = await setUp('Dash-Unranked');
      const a = await insertTestCase(prisma, s, { name: 'A' });
      await insertRunHistory(prisma, s, a, [{ outcome: 'Fail', daysAgo: 1 }, { outcome: 'Fail', daysAgo: 2 }, { outcome: 'Fail', daysAgo: 3 }, { outcome: 'Pass', daysAgo: 4 }]);
      const b = await insertTestCase(prisma, s, { name: 'B' });
      await insertRunHistory(prisma, s, b, [{ outcome: 'Fail', daysAgo: 1 }, { outcome: 'Pass', daysAgo: 2 }]);
      const d = await insertTestCase(prisma, s, { name: 'D' });
      await insertRunHistory(prisma, s, d, [{ outcome: 'Fail', daysAgo: 1 }]);
      const passing = await insertTestCase(prisma, s, { name: 'Passing' });
      await insertRunHistory(prisma, s, passing, [{ outcome: 'Pass', daysAgo: 1 }]);

      const { topFailing, failingBelowMinimum } = (await body(s)).rankings;

      expect(topFailing.map((r: { name: string }) => r.name)).toEqual(['A']);
      expect(failingBelowMinimum).toBe(2);
    });

    it('counts a Pass after an earlier Fail attempt as flaky', async () => {
      const s = await setUp('Dash-Flaky');
      const tc = await insertTestCase(prisma, s, { name: 'Flaky' });
      await insertRuns(prisma, s, await insertExecution(prisma, s), [{ testCaseId: tc, outcome: 'Pass', daysAgo: 1, earlierAttempts: ['Fail'] }]);
      await insertRunHistory(prisma, s, tc, [{ outcome: 'Pass', daysAgo: 2 }]);

      expect((await body(s)).rankings.topFlaky).toEqual([{ id: tc, name: 'Flaky', flaky: 1, completed: 2, flakyPct: 50 }]);
    });

    it('ranks tags by live test cases, without unused tags', async () => {
      const s = await setUp('Dash-Tags');
      const smoke = await insertTag(prisma, s, 'smoke');
      const checkout = await insertTag(prisma, s, 'checkout');
      await insertTag(prisma, s, 'legacy');
      for (let i = 0; i < 5; i++) await insertTestCase(prisma, s, { name: `S${i}`, tagIds: i < 2 ? [smoke, checkout] : [smoke] });

      expect((await body(s)).rankings.topTags).toEqual([
        { tagId: smoke, name: 'smoke', color: 'blue', count: 5 },
        { tagId: checkout, name: 'checkout', color: 'blue', count: 2 },
      ]);
    });

    it('orders ties by name and keeps at most 10 rows', async () => {
      const s = await setUp('Dash-Limit');
      for (const name of ['M', 'L', 'K', 'J', 'I', 'H', 'G', 'F', 'E', 'D', 'C', 'B']) {
        await insertRunHistory(prisma, s, await insertTestCase(prisma, s, { name }), [{ outcome: 'Pass', daysAgo: 1 }]);
      }

      const { mostRun } = (await body(s)).rankings;

      expect(mostRun.map((r: { name: string }) => r.name)).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']);
    });
  });

  describe('Folder Health', () => {
    it('reports paths, counts and breakdowns, worst first, without root test cases', async () => {
      const s = await setUp('Dash-Folders');
      const checkout = await insertFolder(prisma, s, 'Checkout');
      const payments = await insertFolder(prisma, s, 'Payments', checkout);
      const cart = await insertFolder(prisma, s, 'Cart');
      const login = await insertFolder(prisma, s, 'Login');
      const fresh = async (folderId: string, name: string) =>
        insertRunHistory(prisma, s, await insertTestCase(prisma, s, { name, folderId }), [{ outcome: 'Pass', daysAgo: 1 }]);
      const dormant = async (folderId: string, name: string, script?: null) =>
        insertRunHistory(prisma, s, await insertTestCase(prisma, s, { name, folderId, script }), [{ outcome: 'Pass', daysAgo: 20 }]);

      await dormant(payments, 'P1', null);
      await dormant(payments, 'P2');
      await fresh(payments, 'P3');
      await fresh(payments, 'P4');
      for (const name of ['C1', 'C2', 'C3']) await dormant(cart, name);
      await fresh(cart, 'C4');
      await dormant(login, 'L1');
      for (const name of ['L2', 'L3', 'L4']) await fresh(login, name);
      await insertTestCase(prisma, s, { name: 'Root orphan' });

      const rows = (await body(s)).folderHealth as { path: string[]; cases: number; withIssues: number; issuePct: number; breakdown: object }[];

      expect(rows.map((r) => r.path.join(' / '))).toEqual(['Cart', 'Checkout / Payments', 'Login']);
      expect(rows[1]).toMatchObject({ folderId: payments, cases: 4, withIssues: 2, issuePct: 50, breakdown: { Dormant: 2, NoScript: 1 } });
      expect(rows[0]).toMatchObject({ cases: 4, withIssues: 3, issuePct: 75 });
      expect(rows[2]).toMatchObject({ cases: 4, withIssues: 1, issuePct: 25 });
    });
  });

  it('stays inside its tenant', async () => {
    const s = await setUp('Dash-Tenant');
    await insertTestCase(prisma, s, { name: 'Mine' });
    const other = await setUp('Dash-Tenant-Other');
    await insertTestCase(prisma, other, { name: 'Theirs' });

    const count = await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM test_case WHERE project_id = ${other.projectId}::uuid`,
    );
    expect(count[0].n).toBe(0);
    expect((await body(s)).tiles.total).toBe(1);
  });
});
