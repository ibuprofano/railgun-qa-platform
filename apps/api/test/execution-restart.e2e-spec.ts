import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { insertTestCases, setUpProjectMember, sleep } from './helpers/execution-fixtures';
import { startLiveListener } from './helpers/live-listener';
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

interface Setup extends WorkspaceFixture {
  contributor: string;
  admin: string;
  viewer: string;
  testCaseIds: string[];
  executionId: string;
  base: string;
}

interface Run {
  id: string;
  testCaseId: string | null;
  testCaseName: string | null;
  gherkinScript: string | null;
  outcome: string;
  outcomeUpdatedAt: string | null;
  position: number;
}

describe('executions: Restart and attempt history (e2e, ADR 0020)', () => {
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

  async function setUp(label: string, names = ['A', 'B'], body: Record<string, unknown> = {}): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
    const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
    const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
    const testCaseIds = await insertTestCases(prisma, f.workspaceId, f.projectId, names);
    const created = await api()
      .post(`/projects/${f.projectId}/executions`)
      .set(as(contributor))
      .send({ name: label, testCaseIds, ...body });
    const executionId = created.body.id as string;
    return { ...f, contributor, admin, viewer, testCaseIds, executionId, base: `/projects/${f.projectId}/executions/${executionId}` };
  }

  const detail = async (s: Setup) => (await api().get(s.base).set(as(s.viewer))).body;
  const runs = async (s: Setup): Promise<Run[]> => (await detail(s)).runs;

  async function start(s: Setup) {
    await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
    await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
  }

  /** Starts the execution and records one outcome per run, completing it. */
  async function complete(s: Setup, outcomes: string[]) {
    await start(s);
    const ids = (await runs(s)).map((r) => r.id);
    for (const [i, outcome] of outcomes.entries()) {
      await api().patch(`${s.base}/runs/${ids[i]}`).set(as(s.contributor)).send({ outcome });
    }
  }

  const restart = (s: Setup, token = s.contributor) => api().post(`${s.base}/restart`).set(as(token));
  const attemptsOf = (s: Setup, runId: string, token = s.viewer) =>
    api().get(`${s.base}/runs/${runId}/attempts`).set(as(token));

  describe('Restart', () => {
    it('returns a Completed execution to Ready at attempt 2 with everything reset', async () => {
      const s = await setUp('Restart-Completed');
      await complete(s, ['Pass', 'Fail']);
      await sleep(5);

      const response = await restart(s);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'Ready',
        attempt: 2,
        elapsedMsAccumulated: 0,
        lastResumedAt: null,
        startedAt: null,
        completedAt: null,
        signedOffAt: null,
        signedOffBy: null,
      });
      const after = await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$queryRaw<{ outcome: string; outcome_updated_at: Date | null; outcome_updated_by: string | null; snap: string | null }[]>`
          SELECT outcome, outcome_updated_at, outcome_updated_by, test_case_name_snapshot AS snap
          FROM test_run WHERE execution_id = ${s.executionId}::uuid ORDER BY position
        `,
      );
      expect(after).toEqual([
        { outcome: 'Pending', outcome_updated_at: null, outcome_updated_by: null, snap: null },
        { outcome: 'Pending', outcome_updated_at: null, outcome_updated_by: null, snap: null },
      ]);
    });

    it('a Contributor restarts a Canceled execution', async () => {
      const s = await setUp('Restart-Canceled');
      await start(s);
      await api().post(`${s.base}/cancel`).set(as(s.contributor));

      const response = await restart(s);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'Ready', attempt: 2 });
    });

    it('only an Admin restarts a Done execution, and it clears the sign-off', async () => {
      const s = await setUp('Restart-Done', ['A']);
      await complete(s, ['Pass']);
      await api().post(`${s.base}/sign-off`).set(as(s.admin));

      const byContributor = await restart(s);
      const unchanged = await detail(s);
      const byAdmin = await restart(s, s.admin);

      expect(byContributor.status).toBe(403);
      expect(unchanged).toMatchObject({ status: 'Done', attempt: 1 });
      expect(byAdmin.status).toBe(200);
      expect(byAdmin.body).toMatchObject({ status: 'Ready', attempt: 2, signedOffAt: null, signedOffBy: null });
    });

    it('refuses Restart from InProgress (409) and denies a Viewer (403)', async () => {
      const s = await setUp('Restart-Refused');
      await start(s);

      const inProgress = await restart(s);
      await api().post(`${s.base}/cancel`).set(as(s.contributor));
      const byViewer = await restart(s, s.viewer);

      expect(inProgress.status).toBe(409);
      expect(byViewer.status).toBe(403);
      expect(await detail(s)).toMatchObject({ status: 'Canceled', attempt: 1 });
    });

    it('drops the run of a deleted test case, closing up positions; its bug is unlinked but keeps its attempt', async () => {
      const s = await setUp('Restart-Drop', ['A', 'B', 'C']);
      await complete(s, ['Pass', 'Fail', 'Pass']);
      const [, runB] = await runs(s);
      const bug = await api()
        .post(`/projects/${s.projectId}/bugs`)
        .set(as(s.contributor))
        .send({ title: 'B broke', severity: 'High', testRunId: runB.id });
      await api().delete(`/projects/${s.projectId}/test-cases/${s.testCaseIds[1]}`).set(as(s.admin));

      const response = await restart(s);
      const bugAfter = await api().get(`/projects/${s.projectId}/bugs/${bug.body.id}`).set(as(s.viewer));

      expect(response.status).toBe(200);
      expect(response.body.runs.map((r: Run) => [r.testCaseId, r.position])).toEqual([
        [s.testCaseIds[0], 1],
        [s.testCaseIds[2], 2],
      ]);
      expect(bugAfter.status).toBe(200);
      expect(bugAfter.body).toMatchObject({ run: null, attempt: 1 });
    });

    it('keeps the run of a test case that is no longer Ready', async () => {
      const s = await setUp('Restart-Deprecated');
      await complete(s, ['Pass', 'Pass']);
      await api()
        .patch(`/projects/${s.projectId}/test-cases/${s.testCaseIds[1]}`)
        .set(as(s.contributor))
        .send({ status: 'Deprecated' });

      const response = await restart(s);

      expect(response.body.runs.map((r: Run) => [r.testCaseId, r.outcome])).toEqual([
        [s.testCaseIds[0], 'Pending'],
        [s.testCaseIds[1], 'Pending'],
      ]);
    });

    it('refuses (409) and changes nothing when every test case was deleted', async () => {
      const s = await setUp('Restart-AllGone');
      await complete(s, ['Pass', 'Fail']);
      for (const id of s.testCaseIds) {
        await api().delete(`/projects/${s.projectId}/test-cases/${id}`).set(as(s.admin));
      }

      const response = await restart(s);
      const after = await detail(s);

      expect(response.status).toBe(409);
      expect(after).toMatchObject({ status: 'Completed', attempt: 1 });
      expect(after.runs.map((r: Run) => r.outcome)).toEqual(['Pass', 'Fail']);
      const [{ count }] = await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) FROM test_run_attempt WHERE execution_id = ${s.executionId}::uuid`,
      );
      expect(Number(count)).toBe(0);
    });

    it('keeps every run, including a dropped one, as attempt history', async () => {
      const s = await setUp('Restart-History', ['Login', 'Logout']);
      await complete(s, ['Fail', 'Pass']);
      const [login] = await runs(s);
      await api().delete(`/projects/${s.projectId}/test-cases/${s.testCaseIds[1]}`).set(as(s.admin));

      await restart(s);

      const rows = await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$queryRaw<{ test_run_id: string | null; attempt: number; position: number; outcome: string; by: string | null; at: Date | null; name: string | null; script: string | null }[]>`
          SELECT test_run_id, attempt, position, outcome, outcome_updated_by_name AS by, outcome_updated_at AS at,
                 test_case_name_snapshot AS name, gherkin_script_snapshot AS script
          FROM test_run_attempt WHERE execution_id = ${s.executionId}::uuid ORDER BY position
        `,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ test_run_id: login.id, attempt: 1, position: 1, outcome: 'Fail', name: 'Login' });
      expect(rows[0].by).toEqual(expect.any(String));
      expect(rows[0].at).toBeInstanceOf(Date);
      expect(rows[0].script).toEqual(expect.any(String));
      // The dropped run's result survives with its run link cleared.
      expect(rows[1]).toMatchObject({ test_run_id: null, attempt: 1, position: 2, outcome: 'Pass', name: 'Logout' });
    });

    it('the next Run All snapshots the test case as it is now', async () => {
      const s = await setUp('Restart-Resnapshot', ['Old name']);
      await complete(s, ['Pass']);
      await restart(s);
      await api()
        .patch(`/projects/${s.projectId}/test-cases/${s.testCaseIds[0]}`)
        .set(as(s.contributor))
        .send({ name: 'New name' });

      await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
      await api()
        .patch(`/projects/${s.projectId}/test-cases/${s.testCaseIds[0]}`)
        .set(as(s.contributor))
        .send({ name: 'Renamed after start' });

      expect((await runs(s))[0].testCaseName).toBe('New name');
    });

    it('logs the Restart with what it discarded and emits execution.changed', async () => {
      const listener = await startLiveListener();
      try {
        const s = await setUp('Restart-Logged', ['A', 'B']);
        await start(s);
        await sleep(30);
        const ids = (await runs(s)).map((r) => r.id);
        for (const id of ids) {
          await api().patch(`${s.base}/runs/${id}`).set(as(s.contributor)).send({ outcome: 'Pass' });
        }
        const completedElapsed = (await detail(s)).elapsedMsAccumulated as number;
        await api().delete(`/projects/${s.projectId}/test-cases/${s.testCaseIds[0]}`).set(as(s.admin));
        await listener.take();

        await restart(s);

        const [entry] = await withTenantContext(prisma, s.workspaceId, (tx) =>
          tx.$queryRaw<{ details: unknown; actor_user_id: string }[]>`
            SELECT details, actor_user_id FROM activity_entries
            WHERE entity_id = ${s.executionId}::uuid AND action_code = 'test_execution.restarted'
          `,
        );
        expect(entry.details).toEqual({ from: 'Completed', to: 'Ready', elapsedMs: completedElapsed, attempt: 2, droppedRuns: 1 });
        expect(completedElapsed).toBeGreaterThan(0);
        expect((await listener.take()).filter((e) => e.projectId === s.projectId)).toEqual([
          { type: 'execution.changed', workspaceId: s.workspaceId, projectId: s.projectId, executionId: s.executionId },
        ]);
      } finally {
        await listener.close();
      }
    });

    it("another workspace's execution is not found through the caller's own project route (404)", async () => {
      const a = await setUp('Restart-TenantA');
      const b = await setUp('Restart-TenantB');
      await complete(b, ['Pass', 'Pass']);

      const response = await api()
        .post(`/projects/${a.projectId}/executions/${b.executionId}/restart`)
        .set(as(a.contributor));

      expect(response.status).toBe(404);
      expect(await detail(b)).toMatchObject({ status: 'Completed', attempt: 1 });
    });
  });

  describe('attempt history', () => {
    it('is empty before any Restart', async () => {
      const s = await setUp('Attempts-Empty', ['A']);
      const [run] = await runs(s);

      const response = await attemptsOf(s, run.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('lists attempts newest first after two restarts', async () => {
      const s = await setUp('Attempts-Two', ['A']);
      await complete(s, ['Fail']);
      await restart(s);
      await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
      const [run] = await runs(s);
      await api().patch(`${s.base}/runs/${run.id}`).set(as(s.contributor)).send({ outcome: 'Pass' });
      await restart(s);

      const response = await attemptsOf(s, run.id);

      expect(response.status).toBe(200);
      expect(response.body.map((a: { attempt: number; outcome: string }) => [a.attempt, a.outcome])).toEqual([
        [2, 'Pass'],
        [1, 'Fail'],
      ]);
      expect(response.body[0]).toMatchObject({ position: 1, testCaseName: 'A' });
      expect(response.body[0].outcomeUpdatedByName).toEqual(expect.any(String));
      expect(response.body[0].outcomeUpdatedAt).toEqual(expect.any(String));
    });

    it('is 404 for a run of another execution or of another workspace', async () => {
      const s = await setUp('Attempts-404', ['A']);
      const other = await setUp('Attempts-Other', ['B']);
      const [otherRun] = await runs(other);

      const ofOtherExecution = await attemptsOf(s, otherRun.id);
      const crossTenant = await api()
        .get(`/projects/${s.projectId}/executions/${other.executionId}/runs/${otherRun.id}/attempts`)
        .set(as(s.viewer));

      expect(ofOtherExecution.status).toBe(404);
      expect(crossTenant.status).toBe(404);
    });
  });
});
