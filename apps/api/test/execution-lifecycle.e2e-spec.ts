import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { activityCodesFor, insertTestCases, setUpProjectMember, sleep } from './helpers/execution-fixtures';
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

describe('executions: lifecycle (e2e, specs/test-execution-lifecycle)', () => {
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

  /** A project with one member per role and a Draft execution over `runCount` Ready test cases. */
  async function setUp(label: string, runCount = 2): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
    const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
    const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
    const names = Array.from({ length: runCount }, (_, i) => `Case ${i + 1}`);
    const testCaseIds = await insertTestCases(prisma, f.workspaceId, f.projectId, names);
    const created = await api()
      .post(`/projects/${f.projectId}/executions`)
      .set(as(contributor))
      .send({ name: label, testCaseIds });
    const executionId = created.body.id as string;
    return { ...f, contributor, admin, viewer, testCaseIds, executionId, base: `/projects/${f.projectId}/executions/${executionId}` };
  }

  async function start(s: Setup) {
    await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
    return api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
  }

  const runIds = async (s: Setup): Promise<string[]> =>
    (await api().get(s.base).set(as(s.viewer))).body.runs.map((r: { id: string }) => r.id);

  const setOutcome = (s: Setup, runId: string, outcome: string, token = s.contributor) =>
    api().patch(`${s.base}/runs/${runId}`).set(as(token)).send({ outcome });

  describe('Mark as Ready and Back to Draft', () => {
    it('moves Draft → Ready → Draft', async () => {
      const s = await setUp('Life-Ready');

      const ready = await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
      const draft = await api().post(`${s.base}/back-to-draft`).set(as(s.contributor));

      expect(ready.status).toBe(200);
      expect(ready.body.status).toBe('Ready');
      expect(draft.body.status).toBe('Draft');
      expect(await activityCodesFor(prisma, s.workspaceId, s.executionId)).toEqual(
        expect.arrayContaining(['test_execution.marked_ready', 'test_execution.returned_to_draft']),
      );
    });

    it('refuses an invalid transition (Pause on Ready) with 409', async () => {
      const s = await setUp('Life-Invalid');
      await api().post(`${s.base}/mark-ready`).set(as(s.contributor));

      const response = await api().post(`${s.base}/pause`).set(as(s.contributor));
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(response.status).toBe(409);
      expect(detail.body.status).toBe('Ready');
    });

    it('refuses Mark as Ready when a test case was deleted while Draft (409)', async () => {
      const s = await setUp('Life-ReadyDeleted');
      await api().delete(`/projects/${s.projectId}/test-cases/${s.testCaseIds[0]}`).set(as(s.admin));

      const response = await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(response.status).toBe(409);
      expect(detail.body.status).toBe('Draft');
      expect(detail.body.runs[0].testCaseDeleted).toBe(true);
    });

    it('refuses Mark as Ready when a test case was Deprecated while Draft (409)', async () => {
      const s = await setUp('Life-ReadyDeprecated');
      await api()
        .patch(`/projects/${s.projectId}/test-cases/${s.testCaseIds[1]}`)
        .set(as(s.contributor))
        .send({ status: 'Deprecated' });

      const response = await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(response.status).toBe(409);
      expect(detail.body.status).toBe('Draft');
    });
  });

  describe('Run All', () => {
    it('starts the execution and its timer', async () => {
      const s = await setUp('Life-Start');

      const response = await start(s);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'InProgress', elapsedMsAccumulated: 0 });
      expect(response.body.lastResumedAt).not.toBeNull();
      expect(response.body.startedAt).not.toBeNull();
      expect(await activityCodesFor(prisma, s.workspaceId, s.executionId)).toContain('test_execution.started');
    });

    it('snapshots each test case so later edits and deletes do not change the run', async () => {
      const s = await setUp('Life-Snapshot', 1);
      await start(s);

      await api()
        .patch(`/projects/${s.projectId}/test-cases/${s.testCaseIds[0]}`)
        .set(as(s.contributor))
        .send({ name: 'Renamed later', gherkinScript: 'Given something else' });
      const afterEdit = await api().get(s.base).set(as(s.viewer));
      // A run in an InProgress execution blocks the API delete, so soft-delete directly.
      await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$executeRaw`UPDATE test_case SET deleted_at = now() WHERE id = ${s.testCaseIds[0]}::uuid`,
      );
      const afterDelete = await api().get(s.base).set(as(s.viewer));

      for (const detail of [afterEdit, afterDelete]) {
        expect(detail.body.runs[0]).toMatchObject({ testCaseName: 'Case 1', gherkinScript: 'Given Case 1' });
      }
    });

    it('rejects Automated mode with 422', async () => {
      const s = await setUp('Life-Automated');
      await api().post(`${s.base}/mark-ready`).set(as(s.contributor));

      const response = await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Automated' });
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(response.status).toBe(422);
      expect(detail.body.status).toBe('Ready');
    });

    it('refuses to start an execution with no runs (409)', async () => {
      const s = await setUp('Life-Empty', 1);
      await api().post(`${s.base}/mark-ready`).set(as(s.contributor));
      await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$executeRaw`DELETE FROM test_run WHERE execution_id = ${s.executionId}::uuid`,
      );

      const response = await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });

      expect(response.status).toBe(409);
    });

    it('a Viewer cannot start an execution (403)', async () => {
      const s = await setUp('Life-ViewerStart');
      await api().post(`${s.base}/mark-ready`).set(as(s.contributor));

      const response = await api().post(`${s.base}/run-all`).set(as(s.viewer)).send({ mode: 'Manual' });
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(response.status).toBe(403);
      expect(detail.body.status).toBe('Ready');
    });

    it('of two concurrent Run All requests, exactly one succeeds', async () => {
      const s = await setUp('Life-Race');
      await api().post(`${s.base}/mark-ready`).set(as(s.contributor));

      const responses = await Promise.all([
        api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' }),
        api().post(`${s.base}/run-all`).set(as(s.admin)).send({ mode: 'Manual' }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  describe('Pause and Resume', () => {
    it('pausing stops the clock and resuming restarts it from the same total', async () => {
      const s = await setUp('Life-Timer');
      await start(s);
      await sleep(30);

      const paused = await api().post(`${s.base}/pause`).set(as(s.contributor));
      await sleep(50);
      const whilePaused = await api().get(s.base).set(as(s.viewer));
      const resumed = await api().post(`${s.base}/resume`).set(as(s.contributor));

      expect(paused.body).toMatchObject({ status: 'Paused', lastResumedAt: null });
      expect(paused.body.elapsedMsAccumulated).toBeGreaterThan(0);
      expect(whilePaused.body.elapsedMsAccumulated).toBe(paused.body.elapsedMsAccumulated);
      expect(resumed.body.status).toBe('InProgress');
      expect(resumed.body.elapsedMsAccumulated).toBe(paused.body.elapsedMsAccumulated);
      expect(resumed.body.lastResumedAt).not.toBeNull();
    });
  });

  describe('run outcomes and completion', () => {
    it('records a Pass on an InProgress execution', async () => {
      const s = await setUp('Life-Pass');
      await start(s);
      const [first] = await runIds(s);

      const response = await setOutcome(s, first, 'Pass');

      expect(response.status).toBe(200);
      expect(response.body.runs[0].outcome).toBe('Pass');
      expect(response.body.status).toBe('InProgress');
      expect(await activityCodesFor(prisma, s.workspaceId, first)).toEqual(['test_run.outcome_set']);
    });

    it('refuses outcomes while Paused (409)', async () => {
      const s = await setUp('Life-PausedOutcome');
      await start(s);
      await api().post(`${s.base}/pause`).set(as(s.contributor));
      const [first] = await runIds(s);

      expect((await setOutcome(s, first, 'Pass')).status).toBe(409);
    });

    it('rejects resetting a run to Pending (400)', async () => {
      const s = await setUp('Life-Pending');
      await start(s);
      const [first] = await runIds(s);

      expect((await setOutcome(s, first, 'Pending')).status).toBe(400);
    });

    it('a Viewer cannot record outcomes (403)', async () => {
      const s = await setUp('Life-ViewerOutcome');
      await start(s);
      const [first] = await runIds(s);

      expect((await setOutcome(s, first, 'Pass', s.viewer)).status).toBe(403);
    });

    it('the last outcome completes the execution and stops the timer, Needs Review included', async () => {
      const s = await setUp('Life-Complete');
      await start(s);
      const [first, second] = await runIds(s);
      await setOutcome(s, first, 'Fail');

      const response = await setOutcome(s, second, 'NeedsReview');
      await sleep(30);
      const later = await api().get(s.base).set(as(s.viewer));

      expect(response.body).toMatchObject({ status: 'Completed', lastResumedAt: null });
      expect(response.body.completedAt).not.toBeNull();
      expect(later.body.elapsedMsAccumulated).toBe(response.body.elapsedMsAccumulated);
      expect(await activityCodesFor(prisma, s.workspaceId, s.executionId)).toContain('test_execution.completed');
      expect(await activityCodesFor(prisma, s.workspaceId, second)).toEqual(['test_run.outcome_set']);
    });

    it('two concurrent last outcomes still complete the execution', async () => {
      const s = await setUp('Life-OutcomeRace');
      await start(s);
      const [first, second] = await runIds(s);

      const responses = await Promise.all([setOutcome(s, first, 'Pass'), setOutcome(s, second, 'Pass')]);
      const detail = await api().get(s.base).set(as(s.viewer));

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(detail.body.status).toBe('Completed');
    });
  });

  describe('Sign Off', () => {
    async function completed(label: string, outcomes: string[]): Promise<Setup> {
      const s = await setUp(label, outcomes.length);
      await start(s);
      const ids = await runIds(s);
      for (const [i, outcome] of outcomes.entries()) {
        await setOutcome(s, ids[i], outcome);
      }
      return s;
    }

    it('an Admin signs off a Completed execution with only Pass and Fail runs', async () => {
      const s = await completed('Life-SignOff', ['Pass', 'Fail']);

      const response = await api().post(`${s.base}/sign-off`).set(as(s.admin));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Done');
      expect(response.body.signedOffAt).not.toBeNull();
      expect(response.body.signedOffBy).toEqual(expect.any(String));
      expect(await activityCodesFor(prisma, s.workspaceId, s.executionId)).toContain('test_execution.signed_off');
    });

    it('Needs Review blocks sign-off until it is resolved', async () => {
      const s = await completed('Life-SignOffReview', ['Pass', 'NeedsReview']);
      const [, reviewRun] = await runIds(s);

      const blocked = await api().post(`${s.base}/sign-off`).set(as(s.admin));
      const stillCompleted = await api().get(s.base).set(as(s.viewer));
      await setOutcome(s, reviewRun, 'Fail');
      const signed = await api().post(`${s.base}/sign-off`).set(as(s.admin));

      expect(blocked.status).toBe(409);
      expect(stillCompleted.body.status).toBe('Completed');
      expect(signed.body.status).toBe('Done');
    });

    it('a Contributor cannot sign off (403)', async () => {
      const s = await completed('Life-SignOffContrib', ['Pass']);

      expect((await api().post(`${s.base}/sign-off`).set(as(s.contributor))).status).toBe(403);
    });
  });

  it('stores who set an outcome by name, for attempt history (ADR 0020)', async () => {
    const s = await setUp('Life-OutcomeName', 1);
    await start(s);
    const [run] = await runIds(s);

    await setOutcome(s, run, 'Pass');

    const [row] = await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$queryRaw<{ outcome_updated_by_name: string | null }[]>`
        SELECT outcome_updated_by_name FROM test_run WHERE id = ${run}::uuid
      `,
    );
    expect(row.outcome_updated_by_name).toEqual(expect.any(String));
    expect(row.outcome_updated_by_name).not.toBe('');
  });

  describe('Cancel (ADR 0019)', () => {
    it('cancels an In Progress execution: timer stops, Pending runs stay Pending, outcomes lock', async () => {
      const s = await setUp('Life-Cancel', 3);
      await start(s);
      const [first, second] = await runIds(s);
      await setOutcome(s, first, 'Pass');
      await sleep(20);

      const response = await api().post(`${s.base}/cancel`).set(as(s.contributor));
      await sleep(20);
      const later = await api().get(s.base).set(as(s.viewer));
      const lockedPass = await setOutcome(s, first, 'Fail');
      const lockedPending = await setOutcome(s, second, 'Pass');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'Canceled', lastResumedAt: null });
      expect(response.body.elapsedMsAccumulated).toBeGreaterThan(0);
      expect(later.body.elapsedMsAccumulated).toBe(response.body.elapsedMsAccumulated);
      expect(later.body.runs.map((r: { outcome: string }) => r.outcome)).toEqual(['Pass', 'Pending', 'Pending']);
      expect(lockedPass.status).toBe(409);
      expect(lockedPending.status).toBe(409);
      expect((await api().get(s.base).set(as(s.viewer))).body.runs[0].outcome).toBe('Pass');
    });

    it('cancels a Paused execution, keeping its elapsed time, and logs the source status', async () => {
      const s = await setUp('Life-CancelPaused');
      await start(s);
      await sleep(20);
      const paused = await api().post(`${s.base}/pause`).set(as(s.contributor));

      const response = await api().post(`${s.base}/cancel`).set(as(s.contributor));

      expect(response.body.status).toBe('Canceled');
      expect(response.body.elapsedMsAccumulated).toBe(paused.body.elapsedMsAccumulated);
      const entry = await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$queryRaw<{ details: unknown }[]>`
          SELECT details FROM activity_entries
          WHERE entity_id = ${s.executionId}::uuid AND action_code = 'test_execution.canceled'
        `,
      );
      expect(entry).toEqual([{ details: { from: 'Paused', to: 'Canceled' } }]);
    });

    it('refuses Cancel on a Completed execution (409)', async () => {
      const s = await setUp('Life-CancelCompleted', 1);
      await start(s);
      const [run] = await runIds(s);
      await setOutcome(s, run, 'Pass');

      const response = await api().post(`${s.base}/cancel`).set(as(s.contributor));

      expect(response.status).toBe(409);
      expect((await api().get(s.base).set(as(s.viewer))).body.status).toBe('Completed');
    });

    it('a Viewer cannot cancel (403)', async () => {
      const s = await setUp('Life-CancelViewer');
      await start(s);

      expect((await api().post(`${s.base}/cancel`).set(as(s.viewer))).status).toBe(403);
      expect((await api().get(s.base).set(as(s.viewer))).body.status).toBe('InProgress');
    });

    it('emits execution.changed on Cancel and nothing on a refused Cancel', async () => {
      const listener = await startLiveListener();
      try {
        const s = await setUp('Life-CancelLive');
        await listener.take();
        const ofProject = async () => (await listener.take()).filter((e) => e.projectId === s.projectId);

        const refused = await api().post(`${s.base}/cancel`).set(as(s.contributor));
        const refusedEvents = await ofProject();
        await start(s);
        await listener.take();
        await api().post(`${s.base}/cancel`).set(as(s.contributor));

        expect(refused.status).toBe(409);
        expect(refusedEvents).toEqual([]);
        expect(await ofProject()).toEqual([
          { type: 'execution.changed', workspaceId: s.workspaceId, projectId: s.projectId, executionId: s.executionId },
        ]);
      } finally {
        await listener.close();
      }
    });
  });

  describe('live events (specs/live-updates)', () => {
    it('each transition and each outcome emits execution.changed', async () => {
      const listener = await startLiveListener();
      try {
        const s = await setUp('Life-Live', 1);
        const ofProject = async () => (await listener.take()).filter((e) => e.projectId === s.projectId);
        const changed = [
          { type: 'execution.changed', workspaceId: s.workspaceId, projectId: s.projectId, executionId: s.executionId },
        ];
        await listener.take();

        for (const action of ['mark-ready', 'back-to-draft', 'mark-ready']) {
          await api().post(`${s.base}/${action}`).set(as(s.contributor));
          expect(await ofProject()).toEqual(changed);
        }
        await api().post(`${s.base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
        expect(await ofProject()).toEqual(changed);
        await api().post(`${s.base}/pause`).set(as(s.contributor));
        expect(await ofProject()).toEqual(changed);
        await api().post(`${s.base}/resume`).set(as(s.contributor));
        expect(await ofProject()).toEqual(changed);
        const [run] = await runIds(s);
        await setOutcome(s, run, 'Pass');
        expect(await ofProject()).toEqual(changed);
        await api().post(`${s.base}/sign-off`).set(as(s.admin));
        expect(await ofProject()).toEqual(changed);
      } finally {
        await listener.close();
      }
    });

    it('a refused transition (409) emits nothing', async () => {
      const listener = await startLiveListener();
      try {
        const s = await setUp('Life-LiveRefused');
        await listener.take();

        const refused = await api().post(`${s.base}/pause`).set(as(s.contributor));

        expect(refused.status).toBe(409);
        expect((await listener.take()).filter((e) => e.projectId === s.projectId)).toEqual([]);
      } finally {
        await listener.close();
      }
    });

    it('Fail with auto-create on also emits run.bugs.changed for that run, once', async () => {
      const listener = await startLiveListener();
      try {
        const f = await createWorkspaceWithProject(prisma, `Life-LiveBug-${randomUUID().slice(0, 8)}`);
        const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
        const testCaseIds = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B']);
        const created = await api()
          .post(`/projects/${f.projectId}/executions`)
          .set(as(contributor))
          .send({ name: 'AutoBug', testCaseIds, autoCreateBug: true });
        const base = `/projects/${f.projectId}/executions/${created.body.id}`;
        await api().post(`${base}/mark-ready`).set(as(contributor));
        await api().post(`${base}/run-all`).set(as(contributor)).send({ mode: 'Manual' });
        const [run] = created.body.runs.map((r: { id: string }) => r.id);
        await listener.take();
        const scope = { workspaceId: f.workspaceId, projectId: f.projectId, executionId: created.body.id };

        await api().patch(`${base}/runs/${run}`).set(as(contributor)).send({ outcome: 'Fail' });
        const first = (await listener.take()).filter((e) => e.projectId === f.projectId);
        // Failing it again finds the bug already there, so only the outcome change is announced.
        await api().patch(`${base}/runs/${run}`).set(as(contributor)).send({ outcome: 'Fail' });
        const second = (await listener.take()).filter((e) => e.projectId === f.projectId);

        expect(first).toEqual([
          { type: 'run.bugs.changed', ...scope, runId: run },
          { type: 'execution.changed', ...scope },
        ]);
        expect(second).toEqual([{ type: 'execution.changed', ...scope }]);
      } finally {
        await listener.close();
      }
    });
  });
});
