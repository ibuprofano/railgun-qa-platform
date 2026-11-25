import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { filterExecutions, type DashboardExecution, type DashboardRun, type ExecutionDashboardData } from '@railgun-qa/reporting';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { setUpProjectMember } from './helpers/execution-fixtures';
import {
  type DashboardSetup,
  insertExecution,
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

describe('Executions dashboard (e2e, specs/execution-metrics)', () => {
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
    request(app.getHttpServer()).get(`/projects/${s.projectId}/executions/dashboard?tz=${encodeURIComponent(tz)}`).set(as(token));
  const body = async (s: DashboardSetup, tz = 'UTC'): Promise<ExecutionDashboardData> => {
    const response = await read(s, tz);
    expect(response.status).toBe(200);
    return response.body as ExecutionDashboardData;
  };
  const setUp = (label: string) => setUpDashboardProject(prisma, label);
  const sql = (s: DashboardSetup, text: string, ...params: unknown[]) =>
    withTenantContext(prisma, s.workspaceId, (tx) => tx.$executeRawUnsafe(text, ...params));
  const runOf = (data: ExecutionDashboardData, id: string): DashboardRun => {
    const found = data.runs.find((r) => r.id === id);
    expect(found).toBeDefined();
    return found!;
  };

  async function insertBug(s: DashboardSetup, runId: string, attempt: number, failedStep: string | null): Promise<string> {
    const [{ id }] = await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO bug (project_id, workspace_id, title, severity, reporter_id, reporter_display_name, test_run_id, attempt,
           failed_step_snapshot)
         VALUES ($1::uuid, $2::uuid, 'A bug', 'High', $3::uuid, 'Creator', $4::uuid, $5::int, $6) RETURNING id`,
        s.projectId,
        s.workspaceId,
        s.creator,
        runId,
        attempt,
        failedStep,
      ),
    );
    return id;
  }

  describe('access', () => {
    it('a Viewer reads the rows; a member of another workspace gets 403', async () => {
      const s = await setUp('ExDash-Access');
      const other = await createWorkspaceWithProject(prisma, `ExDash-Other-${Date.now()}`);
      const outsider = await setUpProjectMember(prisma, other.workspaceId, other.projectId, 'Admin');

      const data = await body(s);
      expect(Object.keys(data).sort()).toEqual(['executions', 'runs', 'today']);
      expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((await read(s, 'UTC', outsider)).status).toBe(403);
    });

    it('is not read as an execution id, and refuses an unknown time zone', async () => {
      const s = await setUp('ExDash-Route');
      const response = await read(s);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('runs');
      expect((await read(s, 'Mars/Olympus')).status).toBe(400);
    });
  });

  describe('which rows', () => {
    it('leaves out a trashed execution and its runs, and keeps a run of a trashed test case under its recorded name', async () => {
      const s = await setUp('ExDash-Trash');
      const kept = await insertTestCase(prisma, s, { name: 'Renamed later' });
      const gone = await insertTestCase(prisma, s, { name: 'Gone' });
      const live = await insertExecution(prisma, s, 'Done');
      const trashed = await insertExecution(prisma, s, 'Done');
      const [keptRun] = await insertRuns(prisma, s, live, [{ testCaseId: kept, outcome: 'Pass' }]);
      const [goneRun] = await insertRuns(prisma, s, trashed, [{ testCaseId: gone, outcome: 'Fail' }]);
      await sql(s, `UPDATE test_run SET test_case_name_snapshot = 'Recorded name' WHERE id = $1::uuid`, keptRun);
      await trash(prisma, s, 'test_case', kept);
      await trash(prisma, s, 'test_execution', trashed);

      const data = await body(s);
      expect(data.executions.map((e) => e.id)).toEqual([live]);
      expect(data.runs.map((r) => r.id)).toEqual([keptRun]);
      expect(data.runs.some((r) => r.id === goneRun)).toBe(false);
      expect(runOf(data, keptRun).testCaseName).toBe('Recorded name');
    });

    it('reports a restarted run once, Pending, with 2 attempts and no dates', async () => {
      const s = await setUp('ExDash-Restart');
      const tc = await insertTestCase(prisma, s, { name: 'Checkout' });
      const exec = await insertExecution(prisma, s, 'Ready');
      const [runId] = await insertRuns(prisma, s, exec, [{ testCaseId: tc, outcome: 'Pending', earlierAttempts: ['Fail'] }]);

      const data = await body(s);
      expect(data.runs.filter((r) => r.id === runId)).toHaveLength(1);
      expect(runOf(data, runId)).toMatchObject({ outcome: 'Pending', attempts: 2, completedOn: null, outcomeUpdatedAt: null });
    });
  });

  describe('dating', () => {
    it('dates completions in the requested zone; canceled and restarted executions have none', async () => {
      const s = await setUp('ExDash-Dates');
      const tc = await insertTestCase(prisma, s, { name: 'Pay' });
      const completed = await insertExecution(prisma, s, 'Completed');
      const canceled = await insertExecution(prisma, s, 'Canceled');
      const restarted = await insertExecution(prisma, s, 'Ready');
      const [runId] = await insertRuns(prisma, s, completed, [{ testCaseId: tc, outcome: 'Fail', at: new Date('2026-03-03T23:30:00Z') }]);
      await sql(s, `UPDATE test_execution SET completed_at = '2026-03-03T23:30:00Z' WHERE id = $1::uuid`, completed);

      const madrid = await body(s, 'Europe/Madrid');
      const byId = new Map(madrid.executions.map((e) => [e.id, e]));
      expect(byId.get(completed)!.completedOn).toBe('2026-03-04');
      expect(byId.get(canceled)!.completedOn).toBeNull();
      expect(byId.get(restarted)!.completedOn).toBeNull();
      expect(runOf(madrid, runId)).toMatchObject({ completedOn: '2026-03-04', outcomeUpdatedAt: '2026-03-03T23:30:00.000Z' });

      const utc = await body(s, 'UTC');
      expect(utc.executions.find((e) => e.id === completed)!.completedOn).toBe('2026-03-03');
    });
  });

  describe('bugs and the failed step', () => {
    it('counts live bugs from any attempt, and takes the failed step only from the current attempt', async () => {
      const s = await setUp('ExDash-Bugs');
      const tc = await insertTestCase(prisma, s, { name: 'Total' });
      const exec = await insertExecution(prisma, s, 'Completed');
      const [runId] = await insertRuns(prisma, s, exec, [{ testCaseId: tc, outcome: 'Fail', earlierAttempts: ['Fail'] }]);
      await insertBug(s, runId, 1, 'Then the old total is $9');
      const trashed = await insertBug(s, runId, 2, null);
      await sql(s, `UPDATE bug SET deleted_at = now(), deleted_by = $1::uuid WHERE id = $2::uuid`, s.creator, trashed);

      let run = runOf(await body(s), runId);
      expect(run).toMatchObject({ attempts: 2, bugCount: 1, failedStep: null });

      await insertBug(s, runId, 2, 'Then the total is $10');
      run = runOf(await body(s), runId);
      expect(run).toMatchObject({ outcome: 'Fail', attempts: 2, bugCount: 2, failedStep: 'Then the total is $10' });
    });
  });

  describe('scope', () => {
    it('a tag filter picks the same executions from the dashboard rows as from the list', async () => {
      const s = await setUp('ExDash-Scope');
      const payments = await insertTag(prisma, s, `payments-${Date.now()}`);
      const tagged = await insertTestCase(prisma, s, { name: 'Card', tagIds: [payments] });
      const plain = await insertTestCase(prisma, s, { name: 'Search' });
      const a = await insertExecution(prisma, s, 'Done');
      const b = await insertExecution(prisma, s, 'Draft');
      await insertRuns(prisma, s, a, [{ testCaseId: tagged, outcome: 'Pass' }, { testCaseId: plain, outcome: 'Pass' }]);
      await insertRuns(prisma, s, b, [{ testCaseId: plain, outcome: 'Pending' }]);

      const list = await request(app.getHttpServer()).get(`/projects/${s.projectId}/executions`).set(as(s.viewer));
      expect(list.status).toBe(200);
      const data = await body(s);
      const filters = { tagIds: [payments] };
      const listed = list.body as (DashboardExecution & { id: string })[];
      const fromList = filterExecutions(listed, filters).map((e) => e.id);
      const fromDashboard = filterExecutions(data.executions, filters).map((e) => e.id);
      expect(fromDashboard).toEqual([a]);
      expect(fromDashboard.sort()).toEqual(fromList.sort());
    });
  });
});
