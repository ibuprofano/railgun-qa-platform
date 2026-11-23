import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { activityCodesFor, insertEnvironment, insertTestCases, setUpProjectMember } from './helpers/execution-fixtures';
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

describe('executions: authoring (e2e, specs/test-execution-authoring)', () => {
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

  async function fixture(label: string): Promise<WorkspaceFixture> {
    return createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
  }

  async function createExecution(f: WorkspaceFixture, token: string, body: Record<string, unknown>) {
    return api().post(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${token}`).send(body);
  }

  describe('create', () => {
    it('a Contributor creates a Draft execution with one Pending run per test case, in order', async () => {
      const f = await fixture('Exec-Create');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a, b, c] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C']);

      const response = await createExecution(f, contributor, { name: 'Smoke', testCaseIds: [a, b, c] });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ name: 'Smoke', status: 'Draft', counts: { total: 3, done: 0 } });
      expect(response.body.runs.map((r: { position: number; testCaseId: string; outcome: string }) => [r.position, r.testCaseId, r.outcome])).toEqual([
        [1, a, 'Pending'],
        [2, b, 'Pending'],
        [3, c, 'Pending'],
      ]);
      expect(await activityCodesFor(prisma, f.workspaceId, response.body.id)).toEqual(['test_execution.created']);
    });

    it('stores and returns the run conditions, including the environment name', async () => {
      const f = await fixture('Exec-Conditions');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const environmentId = await insertEnvironment(prisma, f.workspaceId, f.projectId, 'Staging');

      const created = await createExecution(f, contributor, {
        name: 'Conditions',
        testCaseIds: [a],
        environmentId,
        browser: 'Firefox',
        viewportWidth: 1280,
        viewportHeight: 720,
        locale: 'pt-BR',
        timezone: 'Europe/Paris',
        autoCreateBug: true,
      });
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`);

      expect(detail.body).toMatchObject({
        environmentId,
        environmentName: 'Staging',
        browser: 'Firefox',
        viewportWidth: 1280,
        viewportHeight: 720,
        locale: 'pt-BR',
        timezone: 'Europe/Paris',
        autoCreateBug: true,
      });
    });

    it('creates an execution without an environment, defaulting the run conditions', async () => {
      const f = await fixture('Exec-NoEnv');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);

      const response = await createExecution(f, contributor, { name: 'No env', testCaseIds: [a] });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ environmentId: null, environmentName: null, browser: 'Chromium', locale: 'en-US', timezone: 'UTC' });
    });

    it('rejects invalid input with 400 and creates nothing', async () => {
      const f = await fixture('Exec-Invalid');
      const other = await fixture('Exec-Invalid-Other');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [ready] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Ready one']);
      const [draftCase] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Draft one'], 'Draft');
      const [deprecated] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Old one'], 'Deprecated');
      const [deleted] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Deleted one']);
      await withTenantContext(prisma, f.workspaceId, (tx) => tx.$executeRaw`UPDATE test_case SET deleted_at = now() WHERE id = ${deleted}::uuid`);
      const [foreignCase] = await insertTestCases(prisma, other.workspaceId, other.projectId, ['Foreign']);
      const foreignEnvironment = await insertEnvironment(prisma, other.workspaceId, other.projectId, 'Foreign env');

      const invalidBodies: Record<string, unknown>[] = [
        { name: '  ', testCaseIds: [ready] },
        { name: 'Foreign case', testCaseIds: [foreignCase] },
        { name: 'Deleted case', testCaseIds: [deleted] },
        { name: 'Draft case', testCaseIds: [draftCase] },
        { name: 'Deprecated case', testCaseIds: [deprecated] },
        { name: 'Unknown case', testCaseIds: [randomUUID()] },
        { name: 'Duplicate', testCaseIds: [ready, ready] },
        { name: 'Foreign env', testCaseIds: [ready], environmentId: foreignEnvironment },
        { name: 'Bad browser', testCaseIds: [ready], browser: 'Safari' },
        { name: 'Bad viewport', testCaseIds: [ready], viewportWidth: 0 },
        { name: 'Bad locale', testCaseIds: [ready], locale: 'not a locale!' },
        { name: 'Bad timezone', testCaseIds: [ready], timezone: 'Mars/Olympus' },
      ];
      for (const body of invalidBodies) {
        const response = await createExecution(f, contributor, body);
        expect({ body: body.name, status: response.status }).toEqual({ body: body.name, status: 400 });
      }

      const list = await api().get(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${contributor}`);
      expect(list.body).toEqual([]);
    });

    it('a Viewer cannot create an execution (403)', async () => {
      const f = await fixture('Exec-ViewerCreate');
      const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);

      const response = await createExecution(f, viewer, { name: 'Nope', testCaseIds: [a] });

      expect(response.status).toBe(403);
    });
  });

  describe('list and detail', () => {
    it('a Viewer lists executions with run counts', async () => {
      const f = await fixture('Exec-List');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
      const ids = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C']);
      const created = await createExecution(f, contributor, { name: 'Counted', testCaseIds: ids });
      await withTenantContext(prisma, f.workspaceId, (tx) =>
        tx.$executeRaw`UPDATE test_run SET outcome = 'Pass' WHERE id = ${created.body.runs[0].id}::uuid`,
      );

      const list = await api().get(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${viewer}`);

      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ name: 'Counted', counts: { total: 3, done: 1, pass: 1, fail: 0, needsReview: 0 } });
      expect(list.body[0].runs).toBeUndefined();
    });

    it("lists each execution's test case tags, each once; untagged executions list none", async () => {
      const f = await fixture('Exec-ListTags');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a, b, c] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C']);
      const tag = async (name: string): Promise<string> =>
        (await api().post(`/projects/${f.projectId}/tags`).set('Authorization', `Bearer ${contributor}`).send({ name })).body.id;
      const [smoke, checkout] = [await tag('smoke'), await tag('checkout')];
      const setTags = (id: string, tagIds: string[]) =>
        api().patch(`/projects/${f.projectId}/test-cases/${id}`).set('Authorization', `Bearer ${contributor}`).send({ tagIds });
      await setTags(a, [smoke]);
      await setTags(b, [smoke, checkout]);
      await createExecution(f, contributor, { name: 'Tagged', testCaseIds: [a, b] });
      await createExecution(f, contributor, { name: 'Untagged', testCaseIds: [c] });

      const list = await api().get(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${contributor}`);

      const byName = new Map((list.body as { name: string; tagIds: string[] }[]).map((e) => [e.name, e.tagIds]));
      expect([...byName.get('Tagged')!].sort()).toEqual([smoke, checkout].sort());
      expect(byName.get('Untagged')).toEqual([]);
    });

    it('a Viewer retrieves an execution with its runs in position order', async () => {
      const f = await fixture('Exec-Detail');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
      const [a, b] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Alpha', 'Beta']);
      const created = await createExecution(f, contributor, { name: 'Detail', testCaseIds: [b, a] });

      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${viewer}`);

      expect(detail.status).toBe(200);
      expect(detail.body.runs.map((r: { testCaseName: string; outcome: string }) => [r.testCaseName, r.outcome])).toEqual([
        ['Beta', 'Pending'],
        ['Alpha', 'Pending'],
      ]);
    });

    it('reports attempt 1 and each run’s current test case status (null once deleted)', async () => {
      const f = await fixture('Exec-TcStatus');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
      const [a, b, c] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C']);
      const created = await createExecution(f, contributor, { name: 'Statuses', testCaseIds: [a, b, c] });
      const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
      await api().patch(`/projects/${f.projectId}/test-cases/${b}`).set(auth(contributor)).send({ status: 'Deprecated' });
      await api().delete(`/projects/${f.projectId}/test-cases/${c}`).set(auth(admin));

      const detail = await api().get(`/projects/${f.projectId}/executions/${created.body.id}`).set(auth(contributor));
      const list = await api().get(`/projects/${f.projectId}/executions`).set(auth(contributor));

      expect(created.body.attempt).toBe(1);
      expect(list.body.find((e: { id: string }) => e.id === created.body.id).attempt).toBe(1);
      expect(
        detail.body.runs.map((r: { testCaseStatus: string | null; testCaseDeleted: boolean }) => [r.testCaseStatus, r.testCaseDeleted]),
      ).toEqual([
        ['Ready', false],
        ['Deprecated', false],
        [null, true],
      ]);
    });

    it('a caller with no access gets 403 on list and detail', async () => {
      const f = await fixture('Exec-NoAccess');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const outsider = await setUpProjectMember(prisma, f.workspaceId, f.projectId, null);
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const created = await createExecution(f, contributor, { name: 'Private', testCaseIds: [a] });

      const list = await api().get(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${outsider}`);
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${outsider}`);

      expect(list.status).toBe(403);
      expect(detail.status).toBe(403);
    });

    it("another workspace's execution is not found through the caller's own project route (404)", async () => {
      const a = await fixture('Exec-TenantA');
      const b = await fixture('Exec-TenantB');
      const viewerA = await setUpProjectMember(prisma, a.workspaceId, a.projectId, 'Viewer');
      const contributorB = await setUpProjectMember(prisma, b.workspaceId, b.projectId, 'Contributor');
      const [caseB] = await insertTestCases(prisma, b.workspaceId, b.projectId, ['B case']);
      const executionB = await createExecution(b, contributorB, { name: 'B only', testCaseIds: [caseB] });

      const response = await api()
        .get(`/projects/${a.projectId}/executions/${executionB.body.id}`)
        .set('Authorization', `Bearer ${viewerA}`);

      expect(response.status).toBe(404);
    });
  });

  describe('edit', () => {
    it('replacing the test case list reorders, adds and removes runs', async () => {
      const f = await fixture('Exec-Edit');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a, b, c, d] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C', 'D']);
      const created = await createExecution(f, contributor, { name: 'Edit me', testCaseIds: [a, b, c] });

      const response = await api()
        .patch(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`)
        .send({ name: 'Edited', testCaseIds: [c, a, d] });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Edited');
      expect(response.body.runs.map((r: { position: number; testCaseId: string }) => [r.position, r.testCaseId])).toEqual([
        [1, c],
        [2, a],
        [3, d],
      ]);
      expect(response.body.runs.some((r: { testCaseId: string }) => r.testCaseId === b)).toBe(false);
      expect(await activityCodesFor(prisma, f.workspaceId, created.body.id)).toEqual(
        expect.arrayContaining(['test_execution.created', 'test_execution.updated']),
      );
    });

    it('replacing the list with a Deprecated test case is rejected (400) and changes nothing', async () => {
      const f = await fixture('Exec-EditDeprecated');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const [old] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Old'], 'Deprecated');
      const created = await createExecution(f, contributor, { name: 'Keep', testCaseIds: [a] });

      const response = await api()
        .patch(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`)
        .send({ testCaseIds: [a, old] });
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`);

      expect(response.status).toBe(400);
      expect(detail.body.runs.map((r: { testCaseId: string }) => r.testCaseId)).toEqual([a]);
    });

    it('editing a Ready execution is refused (409) and changes nothing', async () => {
      const f = await fixture('Exec-EditReady');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const created = await createExecution(f, contributor, { name: 'Locked', testCaseIds: [a] });
      await api()
        .post(`/projects/${f.projectId}/executions/${created.body.id}/mark-ready`)
        .set('Authorization', `Bearer ${contributor}`);

      const response = await api()
        .patch(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`)
        .send({ name: 'Changed' });
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`);

      expect(response.status).toBe(409);
      expect(detail.body.name).toBe('Locked');
    });
  });

  describe('move run', () => {
    type RunRow = { id: string; position: number; testCaseId: string };

    async function draftWithRuns(label: string, role: 'Contributor' | 'Viewer' = 'Contributor') {
      const f = await fixture(label);
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const token = role === 'Contributor' ? contributor : await setUpProjectMember(prisma, f.workspaceId, f.projectId, role);
      const testCases = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B', 'C']);
      const created = await createExecution(f, contributor, { name: 'Order me', testCaseIds: testCases });
      const [a, b, c] = (created.body.runs as RunRow[]).map((run) => run.id);
      return { f, contributor, token, executionId: created.body.id as string, a, b, c };
    }

    function move(f: WorkspaceFixture, token: string, executionId: string, runId: string, afterRunId: string | null) {
      return api()
        .post(`/projects/${f.projectId}/executions/${executionId}/runs/${runId}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ afterRunId });
    }

    async function runOrder(f: WorkspaceFixture, token: string, executionId: string) {
      const detail = await api().get(`/projects/${f.projectId}/executions/${executionId}`).set('Authorization', `Bearer ${token}`);
      return (detail.body.runs as RunRow[]).map((run) => [run.position, run.id]);
    }

    it('moves a run after another, keeping run ids, and logs the reorder with the actor', async () => {
      const { f, contributor, executionId, a, b, c } = await draftWithRuns('Exec-MoveAfter');

      const response = await move(f, contributor, executionId, c, a);

      expect(response.status).toBe(200);
      expect((response.body.runs as RunRow[]).map((run) => [run.position, run.id])).toEqual([
        [1, a],
        [2, c],
        [3, b],
      ]);
      const entries = await withTenantContext(prisma, f.workspaceId, (tx) =>
        tx.$queryRaw<{ actor_display_name: string }[]>`
          SELECT actor_display_name FROM activity_entries
          WHERE entity_id = ${executionId}::uuid AND action_code = 'test_execution.runs_reordered'`,
      );
      expect(entries).toEqual([{ actor_display_name: 'Contributor User' }]);
    });

    it('moves a run first when afterRunId is null', async () => {
      const { f, contributor, executionId, a, b, c } = await draftWithRuns('Exec-MoveFirst');

      await move(f, contributor, executionId, c, null);

      expect(await runOrder(f, contributor, executionId)).toEqual([
        [1, c],
        [2, a],
        [3, b],
      ]);
    });

    it('a move that changes nothing succeeds and writes no activity entry', async () => {
      const { f, contributor, executionId, a, b, c } = await draftWithRuns('Exec-MoveNoop');

      const response = await move(f, contributor, executionId, b, a);

      expect(response.status).toBe(200);
      expect(await runOrder(f, contributor, executionId)).toEqual([
        [1, a],
        [2, b],
        [3, c],
      ]);
      expect(await activityCodesFor(prisma, f.workspaceId, executionId)).toEqual(['test_execution.created']);
    });

    it('rejects an afterRunId that is the run itself, from another execution, or malformed (400)', async () => {
      const { f, contributor, executionId, a, b, c } = await draftWithRuns('Exec-MoveBadAfter');
      const [other] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Other']);
      const otherExecution = await createExecution(f, contributor, { name: 'Other', testCaseIds: [other] });
      const otherRun = (otherExecution.body.runs as RunRow[])[0].id;

      for (const afterRunId of [b, otherRun, randomUUID()]) {
        expect((await move(f, contributor, executionId, b, afterRunId)).status).toBe(400);
      }
      const malformed = await api()
        .post(`/projects/${f.projectId}/executions/${executionId}/runs/${b}/move`)
        .set('Authorization', `Bearer ${contributor}`)
        .send({ afterRunId: 'abc' });
      expect(malformed.status).toBe(400);
      expect(await runOrder(f, contributor, executionId)).toEqual([
        [1, a],
        [2, b],
        [3, c],
      ]);
    });

    it('a run that is not part of the execution is not found (404)', async () => {
      const { f, contributor, executionId } = await draftWithRuns('Exec-MoveForeignRun');
      const [other] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['Other']);
      const otherExecution = await createExecution(f, contributor, { name: 'Other', testCaseIds: [other] });
      const otherRun = (otherExecution.body.runs as RunRow[])[0].id;

      expect((await move(f, contributor, executionId, otherRun, null)).status).toBe(404);
      expect((await move(f, contributor, executionId, 'not-a-uuid', null)).status).toBe(404);
    });

    it('moving a run of a Ready execution is refused (409) and changes nothing', async () => {
      const { f, contributor, executionId, a, b, c } = await draftWithRuns('Exec-MoveReady');
      await api()
        .post(`/projects/${f.projectId}/executions/${executionId}/mark-ready`)
        .set('Authorization', `Bearer ${contributor}`);

      expect((await move(f, contributor, executionId, c, null)).status).toBe(409);
      expect(await runOrder(f, contributor, executionId)).toEqual([
        [1, a],
        [2, b],
        [3, c],
      ]);
    });

    it('a Viewer cannot move runs (403)', async () => {
      const { f, token, executionId, a, c } = await draftWithRuns('Exec-MoveViewer', 'Viewer');

      expect((await move(f, token, executionId, c, a)).status).toBe(403);
    });

    it("another workspace's execution is not found through the caller's own project route (404)", async () => {
      const { executionId, c } = await draftWithRuns('Exec-MoveTenantB');
      const a = await fixture('Exec-MoveTenantA');
      const contributorA = await setUpProjectMember(prisma, a.workspaceId, a.projectId, 'Contributor');

      expect((await move(a, contributorA, executionId, c, null)).status).toBe(404);
    });
  });

  describe('add and remove runs (ADR 0021)', () => {
    type RunRow = { id: string; position: number; testCaseId: string; outcome: string };

    async function draft(label: string, names = ['A', 'B', 'C']) {
      const f = await fixture(label);
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
      const ids = await insertTestCases(prisma, f.workspaceId, f.projectId, names);
      const created = await createExecution(f, contributor, { name: label, testCaseIds: ids });
      const base = `/projects/${f.projectId}/executions/${created.body.id}`;
      const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
      const runs = async (): Promise<RunRow[]> => (await api().get(base).set(auth(contributor))).body.runs;
      return { f, contributor, viewer, ids, executionId: created.body.id as string, base, auth, runs };
    }

    const entryDetails = (f: WorkspaceFixture, executionId: string, code: string) =>
      withTenantContext(prisma, f.workspaceId, (tx) =>
        tx.$queryRaw<{ details: Record<string, unknown>; actor_display_name: string }[]>`
          SELECT details, actor_display_name FROM activity_entries
          WHERE entity_id = ${executionId}::uuid AND action_code = ${code}
        `,
      );

    it('adds a Ready test case as the last Pending run, and logs it', async () => {
      const d = await draft('Run-Add');
      const [extra] = await insertTestCases(prisma, d.f.workspaceId, d.f.projectId, ['D']);

      const response = await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId: extra });

      expect(response.status).toBe(201);
      expect(response.body.runs.map((r: RunRow) => [r.testCaseId, r.position, r.outcome])).toEqual([
        [d.ids[0], 1, 'Pending'],
        [d.ids[1], 2, 'Pending'],
        [d.ids[2], 3, 'Pending'],
        [extra, 4, 'Pending'],
      ]);
      const [entry] = await entryDetails(d.f, d.executionId, 'test_execution.run_added');
      expect(entry.details).toEqual({ testCaseId: extra, testCaseName: 'D', position: 4 });
      expect(entry.actor_display_name).toEqual(expect.any(String));
    });

    it('refuses a test case already in the execution (409)', async () => {
      const d = await draft('Run-AddDup');

      const response = await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId: d.ids[1] });

      expect(response.status).toBe(409);
      expect(await d.runs()).toHaveLength(3);
    });

    it('rejects Draft, Deprecated, deleted, foreign or malformed test cases (400)', async () => {
      const d = await draft('Run-AddInvalid');
      const admin = await setUpProjectMember(prisma, d.f.workspaceId, d.f.projectId, 'Admin');
      const [drafty, old, gone] = await insertTestCases(prisma, d.f.workspaceId, d.f.projectId, ['Drafty', 'Old', 'Gone']);
      await api().patch(`/projects/${d.f.projectId}/test-cases/${drafty}`).set(d.auth(d.contributor)).send({ status: 'Draft' });
      await api().patch(`/projects/${d.f.projectId}/test-cases/${old}`).set(d.auth(d.contributor)).send({ status: 'Deprecated' });
      await api().delete(`/projects/${d.f.projectId}/test-cases/${gone}`).set(d.auth(admin));
      const other = await fixture('Run-AddInvalid-Other');
      const [foreign] = await insertTestCases(prisma, other.workspaceId, other.projectId, ['Foreign']);

      for (const testCaseId of [drafty, old, gone, foreign, 'not-a-uuid']) {
        const response = await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId });
        expect(response.status).toBe(400);
      }
      expect(await d.runs()).toHaveLength(3);
    });

    it('refuses adding to a Ready execution (409), and denies a Viewer (403)', async () => {
      const d = await draft('Run-AddReady');
      const [extra] = await insertTestCases(prisma, d.f.workspaceId, d.f.projectId, ['D']);

      const byViewer = await api().post(`${d.base}/runs`).set(d.auth(d.viewer)).send({ testCaseId: extra });
      await api().post(`${d.base}/mark-ready`).set(d.auth(d.contributor));
      const onReady = await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId: extra });

      expect(byViewer.status).toBe(403);
      expect(onReady.status).toBe(409);
      expect(await d.runs()).toHaveLength(3);
    });

    it('removes a run, closing up positions and keeping run ids, and logs it', async () => {
      const d = await draft('Run-Remove');
      const [a, b, c] = await d.runs();

      const response = await api().delete(`${d.base}/runs/${b.id}`).set(d.auth(d.contributor));

      expect(response.status).toBe(200);
      expect(response.body.runs.map((r: RunRow) => [r.id, r.position])).toEqual([
        [a.id, 1],
        [c.id, 2],
      ]);
      const [entry] = await entryDetails(d.f, d.executionId, 'test_execution.run_removed');
      expect(entry.details).toEqual({ testCaseId: d.ids[1], testCaseName: 'B', fromPosition: 2 });
    });

    it('refuses removing the last run (409)', async () => {
      const d = await draft('Run-RemoveLast', ['Only']);
      const [only] = await d.runs();

      const response = await api().delete(`${d.base}/runs/${only.id}`).set(d.auth(d.contributor));

      expect(response.status).toBe(409);
      expect(await d.runs()).toHaveLength(1);
    });

    it('refuses on a Ready execution (409), 404s a run of another execution, and denies a Viewer (403)', async () => {
      const d = await draft('Run-RemoveRefused');
      const other = await draft('Run-RemoveRefused-Other');
      const [otherRun] = await other.runs();
      const [first] = await d.runs();

      const foreignRun = await api().delete(`${d.base}/runs/${otherRun.id}`).set(d.auth(d.contributor));
      const byViewer = await api().delete(`${d.base}/runs/${first.id}`).set(d.auth(d.viewer));
      await api().post(`${d.base}/mark-ready`).set(d.auth(d.contributor));
      const onReady = await api().delete(`${d.base}/runs/${first.id}`).set(d.auth(d.contributor));

      expect(foreignRun.status).toBe(404);
      expect(byViewer.status).toBe(403);
      expect(onReady.status).toBe(409);
      expect(await d.runs()).toHaveLength(3);
    });

    it('adding and removing emit execution.changed; a refusal emits nothing', async () => {
      const listener = await startLiveListener();
      try {
        const d = await draft('Run-Live');
        const [extra] = await insertTestCases(prisma, d.f.workspaceId, d.f.projectId, ['D']);
        const ofProject = async () => (await listener.take()).filter((e) => e.projectId === d.f.projectId);
        const expected = [{ type: 'execution.changed', workspaceId: d.f.workspaceId, projectId: d.f.projectId, executionId: d.executionId }];
        await listener.take();

        await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId: extra });
        expect(await ofProject()).toEqual(expected);
        const [first] = await d.runs();
        await api().delete(`${d.base}/runs/${first.id}`).set(d.auth(d.contributor));
        expect(await ofProject()).toEqual(expected);
        await api().post(`${d.base}/runs`).set(d.auth(d.contributor)).send({ testCaseId: extra });
        expect(await ofProject()).toEqual([]);
      } finally {
        await listener.close();
      }
    });
  });

  describe('delete', () => {
    it('an Admin soft-deletes a Draft execution', async () => {
      const f = await fixture('Exec-Delete');
      const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const created = await createExecution(f, admin, { name: 'Doomed', testCaseIds: [a] });

      const response = await api()
        .delete(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`);
      const list = await api().get(`/projects/${f.projectId}/executions`).set('Authorization', `Bearer ${admin}`);
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`);

      expect(response.status).toBe(204);
      expect(list.body).toEqual([]);
      expect(detail.status).toBe(404);
      expect(await activityCodesFor(prisma, f.workspaceId, created.body.id)).toContain('test_execution.deleted');
    });

    it('a Contributor cannot delete an execution (403)', async () => {
      const f = await fixture('Exec-DeleteContrib');
      const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const created = await createExecution(f, contributor, { name: 'Safe', testCaseIds: [a] });

      const response = await api()
        .delete(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${contributor}`);

      expect(response.status).toBe(403);
    });

    it('deleting an InProgress execution is refused (409) and leaves it unchanged', async () => {
      const f = await fixture('Exec-DeleteRunning');
      const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const created = await createExecution(f, admin, { name: 'Running', testCaseIds: [a] });
      const base = `/projects/${f.projectId}/executions/${created.body.id}`;
      await api().post(`${base}/mark-ready`).set('Authorization', `Bearer ${admin}`);
      await api().post(`${base}/run-all`).set('Authorization', `Bearer ${admin}`).send({ mode: 'Manual' });

      const response = await api().delete(base).set('Authorization', `Bearer ${admin}`);
      const detail = await api().get(base).set('Authorization', `Bearer ${admin}`);

      expect(response.status).toBe(409);
      expect(detail.body.status).toBe('InProgress');
    });
  });

  describe('environment deletion (G10)', () => {
    it('an execution keeps the environment name after the environment is deleted', async () => {
      const f = await fixture('Exec-EnvDelete');
      const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
      const [a] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A']);
      const environmentId = await insertEnvironment(prisma, f.workspaceId, f.projectId, 'Doomed env');
      const created = await createExecution(f, admin, { name: 'Linked', testCaseIds: [a], environmentId });

      const deleted = await api()
        .delete(`/projects/${f.projectId}/environments/${environmentId}`)
        .set('Authorization', `Bearer ${admin}`);
      const detail = await api()
        .get(`/projects/${f.projectId}/executions/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`);

      expect(deleted.status).toBe(204);
      expect(detail.body).toMatchObject({ environmentId: null, environmentName: 'Doomed env' });
    });
  });

  describe('live events (specs/live-updates)', () => {
    it('create, edit, run move and delete each emit execution.changed with the execution id', async () => {
      const listener = await startLiveListener();
      try {
        const f = await fixture('Exec-Live');
        const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
        const [a, b] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B']);
        const auth = { Authorization: `Bearer ${admin}` };
        const ofProject = async () => (await listener.take()).filter((e) => e.projectId === f.projectId);
        const expected = (executionId: string) => [
          { type: 'execution.changed', workspaceId: f.workspaceId, projectId: f.projectId, executionId },
        ];

        const created = await createExecution(f, admin, { name: 'Live', testCaseIds: [a, b] });
        const base = `/projects/${f.projectId}/executions/${created.body.id}`;
        expect(await ofProject()).toEqual(expected(created.body.id));

        await api().patch(base).set(auth).send({ name: 'Live 2' });
        expect(await ofProject()).toEqual(expected(created.body.id));

        const [, second] = created.body.runs.map((r: { id: string }) => r.id);
        await api().post(`${base}/runs/${second}/move`).set(auth).send({ afterRunId: null });
        expect(await ofProject()).toEqual(expected(created.body.id));

        await api().delete(base).set(auth);
        expect(await ofProject()).toEqual(expected(created.body.id));
      } finally {
        await listener.close();
      }
    });

    it('a refused edit (409) and a move that changes nothing emit no event', async () => {
      const listener = await startLiveListener();
      try {
        const f = await fixture('Exec-LiveRefused');
        const admin = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin');
        const [a, b] = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B']);
        const auth = { Authorization: `Bearer ${admin}` };
        const created = await createExecution(f, admin, { name: 'Refused', testCaseIds: [a, b] });
        const base = `/projects/${f.projectId}/executions/${created.body.id}`;
        const [first] = created.body.runs.map((r: { id: string }) => r.id);
        await listener.take();

        const unchanged = await api().post(`${base}/runs/${first}/move`).set(auth).send({ afterRunId: null });
        expect(unchanged.status).toBe(200);
        expect((await listener.take()).filter((e) => e.projectId === f.projectId)).toEqual([]);

        await api().post(`${base}/mark-ready`).set(auth);
        await listener.take();
        const refused = await api().patch(base).set(auth).send({ name: 'Nope' });

        expect(refused.status).toBe(409);
        expect((await listener.take()).filter((e) => e.projectId === f.projectId)).toEqual([]);
      } finally {
        await listener.close();
      }
    });
  });
});
