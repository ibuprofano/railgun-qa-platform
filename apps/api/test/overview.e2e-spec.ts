import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { insertTestCases, setUpProjectMember } from './helpers/execution-fixtures';
import { insertTestUser } from './helpers/membership-fixtures';
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

type Outcome = 'Pending' | 'Pass' | 'Fail' | 'NeedsReview';

describe('Overview stats (e2e, specs/project-metrics)', () => {
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

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface Setup extends WorkspaceFixture {
    viewer: string;
    contributor: string;
    admin: string;
    creator: string;
  }

  async function setUp(label: string): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    return {
      ...f,
      viewer: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer'),
      contributor: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor'),
      admin: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin'),
      creator: await insertTestUser(prisma, `clerk-overview-${randomUUID()}`, 'Creator'),
    };
  }

  /** An execution in `status`, directly in the database. */
  async function execution(s: Setup, status = 'Completed'): Promise<string> {
    const id = randomUUID();
    await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO test_execution (id, project_id, workspace_id, name, status, browser, viewport_width,
          viewport_height, locale, timezone, created_by)
        VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${`Exec ${id.slice(0, 4)}`}, ${status},
          'Chromium', 1280, 720, 'en-US', 'UTC', ${s.creator}::uuid)`,
    );
    return id;
  }

  /** Runs of one execution: each [test case, outcome, days ago its outcome was recorded]. */
  async function runs(s: Setup, executionId: string, rows: [string, Outcome, number][]): Promise<void> {
    await withTenantContext(prisma, s.workspaceId, async (tx) => {
      for (const [index, [testCaseId, outcome, daysAgo]] of rows.entries()) {
        const at = outcome === 'Pending' ? null : new Date(Date.now() - daysAgo * 86_400_000);
        await tx.$executeRaw`INSERT INTO test_run (execution_id, workspace_id, test_case_id, position, outcome, outcome_updated_at)
          VALUES (${executionId}::uuid, ${s.workspaceId}::uuid, ${testCaseId}::uuid, ${index + 1}, ${outcome}, ${at})`;
      }
    });
  }

  /** `count` runs of one test case, one per new execution (a test case runs once per execution). */
  async function runsOf(s: Setup, testCaseId: string, outcomes: Outcome[], daysAgo = 1): Promise<void> {
    for (const outcome of outcomes) {
      await runs(s, await execution(s), [[testCaseId, outcome, daysAgo]]);
    }
  }

  async function bug(s: Setup, severity: string, status: string, createdDaysAgo = 0): Promise<string> {
    const id = randomUUID();
    const createdAt = new Date(Date.now() - createdDaysAgo * 86_400_000);
    const resolvedAt = ['Resolved', 'Closed', 'WontFix'].includes(status) ? new Date() : null;
    await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO bug (id, project_id, workspace_id, title, severity, status, reporter_id,
          reporter_display_name, created_at, resolved_at)
        VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, ${`${severity} ${status}`}, ${severity}, ${status},
          ${s.creator}::uuid, 'Creator', ${createdAt}, ${resolvedAt})`,
    );
    return id;
  }

  const overview = async (s: Setup, token = s.viewer) => api().get(`/projects/${s.projectId}/overview`).set(as(token));

  describe('KPIs', () => {
    it('pass rate counts Needs Review and only the last 30 days', async () => {
      const s = await setUp('Ov-PassRate');
      const ids = await insertTestCases(prisma, s.workspaceId, s.projectId, Array.from({ length: 11 }, (_, i) => `T${i}`));
      const outcomes: Outcome[] = ['Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Fail', 'Fail', 'NeedsReview', 'NeedsReview'];
      await runs(s, await execution(s), [
        ...outcomes.map((o, i): [string, Outcome, number] => [ids[i], o, 2]),
        [ids[10], 'Pass', 40],
      ]);

      const response = await overview(s);

      expect(response.status).toBe(200);
      expect(response.body.passRate).toBe(60);
    });

    it('reports no pass rate, and a pass-rate component of 0, with only old runs', async () => {
      const s = await setUp('Ov-OldRuns');
      const [tc] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Old']);
      await runs(s, await execution(s), [[tc, 'Pass', 45]]);

      const body = (await overview(s)).body;

      expect(body.passRate).toBeNull();
      expect(body.health.components.passRate).toBe(0);
      expect(body.health.score).toEqual(expect.any(Number));
    });

    it('counts test cases, the Ready share and coverage', async () => {
      const s = await setUp('Ov-Cases');
      const [ready] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Ready one']);
      const drafts = await insertTestCases(prisma, s.workspaceId, s.projectId, ['D1', 'D2', 'D3'], 'Draft');
      await runs(s, await execution(s), [
        [ready, 'Pass', 1],
        [drafts[0], 'Fail', 1],
        [drafts[1], 'NeedsReview', 1],
      ]);
      await runs(s, await execution(s), [[drafts[2], 'Pending', 0]]);

      expect((await overview(s)).body.testCases).toEqual({ total: 4, readyPct: 25, coveragePct: 75 });
    });

    it('counts open bugs, open critical bugs and executions In Progress', async () => {
      const s = await setUp('Ov-Bugs');
      await bug(s, 'Critical', 'Open');
      await bug(s, 'High', 'InProgress');
      await bug(s, 'Critical', 'Resolved');
      await execution(s, 'InProgress');
      await execution(s, 'Paused');

      const body = (await overview(s)).body;

      expect(body).toMatchObject({ openBugs: 2, criticalBugs: 1, activeExecutions: 1 });
    });

    it('an empty project reports zeros, no pass rate and no score', async () => {
      const s = await setUp('Ov-Empty');

      expect((await overview(s)).body).toEqual({
        testCases: { total: 0, readyPct: 0, coveragePct: 0 },
        passRate: null,
        activeExecutions: 0,
        openBugs: 0,
        criticalBugs: 0,
        health: { score: null, band: null, components: { passRate: 0, coverage: 0, bugPressure: 100, freshness: 0 } },
        topFailingTests: [],
        failingBelowMinimum: 0,
        urgentBugs: [],
      });
    });
  });

  describe('Health Score', () => {
    it('combines the four components: 90, 80, 97, 75 → 88, Healthy', async () => {
      const s = await setUp('Ov-Health');
      // 5 test cases (4 Ready, 1 Draft); 4 of them covered (80%); 3 Ready ones fresh (75%).
      const ready = await insertTestCases(prisma, s.workspaceId, s.projectId, ['R1', 'R2', 'R3', 'R4']);
      const [draft] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['D1'], 'Draft');
      // 10 recent runs, 9 Pass (90%), spread so R1–R3 and D1 are covered and R4 is not.
      const recent: [string, Outcome][] = [
        [ready[0], 'Pass'], [ready[0], 'Pass'], [ready[0], 'Pass'],
        [ready[1], 'Pass'], [ready[1], 'Pass'], [ready[1], 'Pass'],
        [ready[2], 'Pass'], [ready[2], 'Pass'],
        [draft, 'Pass'], [draft, 'Fail'],
      ];
      for (const [tc, outcome] of recent) {
        await runsOf(s, tc, [outcome], 2);
      }
      await bug(s, 'Medium', 'Open');

      const { health, passRate, testCases } = (await overview(s)).body;

      expect({ passRate, coverage: testCases.coveragePct }).toEqual({ passRate: 90, coverage: 80 });
      expect(health).toEqual({ score: 88, band: 'Healthy', components: { passRate: 90, coverage: 80, bugPressure: 97, freshness: 75 } });
    });

    it('floors bug pressure at 0', async () => {
      const s = await setUp('Ov-Pressure');
      for (let i = 0; i < 5; i += 1) await bug(s, 'Critical', 'Open');

      expect((await overview(s)).body.health.components.bugPressure).toBe(0);
    });

    it('has no score or band without any completed run, while the other KPIs are reported', async () => {
      const s = await setUp('Ov-NoRuns');
      const [tc] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Never run']);
      await runs(s, await execution(s, 'Ready'), [[tc, 'Pending', 0]]);
      await bug(s, 'High', 'Open');

      const body = (await overview(s)).body;

      expect(body.health).toMatchObject({ score: null, band: null });
      expect(body.testCases.total).toBe(1);
      expect(body.openBugs).toBe(1);
    });
  });

  describe('Top Failing Tests', () => {
    it('ranks by fail rate, needing 3 completed runs and a failure', async () => {
      const s = await setUp('Ov-Failing');
      const [a, b, c, d] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['A', 'B', 'C', 'D']);
      await runsOf(s, a, ['Fail', 'Fail', 'Fail', 'Pass']);
      await runsOf(s, b, ['Fail', 'Pass']);
      await runsOf(s, c, ['Fail', 'Fail', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass']);
      await runsOf(s, d, ['Pass', 'Pass', 'Pass', 'Pass', 'Pass']);

      expect((await overview(s)).body.topFailingTests).toEqual([
        { id: a, name: 'A', failed: 3, completed: 4, failRatePct: 75 },
        { id: c, name: 'C', failed: 2, completed: 8, failRatePct: 25 },
      ]);
      // B failed but has only 2 completed runs (design.md decision 7 of test-cases-dashboard).
      expect((await overview(s)).body.failingBelowMinimum).toBe(1);
    });

    it('lists at most six and drops a trashed test case', async () => {
      const s = await setUp('Ov-FailingMax');
      const ids = await insertTestCases(prisma, s.workspaceId, s.projectId, Array.from({ length: 9 }, (_, i) => `F${i}`));
      for (const id of ids) await runsOf(s, id, ['Fail', 'Pass', 'Pass']);
      // The worst one, then trashed.
      await runsOf(s, ids[0], ['Fail', 'Fail']);
      await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$executeRaw`UPDATE test_case SET deleted_at = now() WHERE id = ${ids[0]}::uuid`,
      );

      const listed = (await overview(s)).body.topFailingTests as { id: string }[];

      expect(listed).toHaveLength(6);
      expect(listed.map((t) => t.id)).not.toContain(ids[0]);
    });
  });

  it('Urgent Bugs lists open Critical first, then High, newest first', async () => {
    const s = await setUp('Ov-Urgent');
    const highToday = await bug(s, 'High', 'Open', 0);
    const criticalLastWeek = await bug(s, 'Critical', 'InProgress', 7);
    await bug(s, 'Critical', 'Resolved', 1);
    await bug(s, 'Medium', 'Open', 0);

    const urgent = (await overview(s)).body.urgentBugs as { id: string; severity: string; status: string; createdAt: string }[];

    expect(urgent.map((b) => [b.id, b.severity, b.status])).toEqual([
      [criticalLastWeek, 'Critical', 'InProgress'],
      [highToday, 'High', 'Open'],
    ]);
    expect(urgent[0].createdAt).toEqual(expect.any(String));
  });

  describe('exclusions', () => {
    it("a deleted execution's runs stop counting, and count again once restored", async () => {
      const s = await setUp('Ov-DeletedExec');
      const [tc] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Login']);
      const draft = await execution(s, 'Draft');
      await runs(s, draft, [[tc, 'Pass', 1]]);
      expect((await overview(s)).body.passRate).toBe(100);

      expect((await api().delete(`/projects/${s.projectId}/executions/${draft}`).set(as(s.admin))).status).toBe(204);
      const deleted = (await overview(s)).body;
      expect(deleted.passRate).toBeNull();
      expect(deleted.testCases.coveragePct).toBe(0);

      expect((await api().post(`/projects/${s.projectId}/trash/execution/${draft}/restore`).set(as(s.admin))).status).toBe(200);
      expect((await overview(s)).body.passRate).toBe(100);
    });

    it('a restarted execution counts only the new outcome', async () => {
      const s = await setUp('Ov-Restart');
      const [tc] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Checkout']);
      const created = await api()
        .post(`/projects/${s.projectId}/executions`)
        .set(as(s.contributor))
        .send({ name: 'Smoke', testCaseIds: [tc] });
      const base = `/projects/${s.projectId}/executions/${created.body.id}`;
      const runId = created.body.runs[0].id as string;
      const start = async () => {
        await api().post(`${base}/mark-ready`).set(as(s.contributor));
        await api().post(`${base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
      };
      await start();
      await api().patch(`${base}/runs/${runId}`).set(as(s.contributor)).send({ outcome: 'Fail' });
      expect((await overview(s)).body.passRate).toBe(0);

      expect((await api().post(`${base}/restart`).set(as(s.contributor))).status).toBe(200);
      await api().post(`${base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
      await api().patch(`${base}/runs/${runId}`).set(as(s.contributor)).send({ outcome: 'Pass' });

      expect((await overview(s)).body.passRate).toBe(100);
    });

    it('a trashed bug leaves every bug figure', async () => {
      const s = await setUp('Ov-TrashedBug');
      const critical = await bug(s, 'Critical', 'Open');
      expect((await overview(s)).body).toMatchObject({ openBugs: 1, criticalBugs: 1 });

      await api().delete(`/projects/${s.projectId}/bugs/${critical}`).set(as(s.admin));

      const body = (await overview(s)).body;
      expect(body).toMatchObject({ openBugs: 0, criticalBugs: 0, urgentBugs: [] });
      expect(body.health.components.bugPressure).toBe(100);
    });
  });

  it('refuses a caller with no access, including another workspace’s member (403)', async () => {
    const s = await setUp('Ov-Access');
    const outsider = await setUpProjectMember(prisma, s.workspaceId, s.projectId, null);
    const other = await setUp('Ov-Access-Other');

    expect((await overview(s, outsider)).status).toBe(403);
    expect((await overview(s, other.viewer)).status).toBe(403);
  });
});
