import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { setUpProjectMember } from './helpers/execution-fixtures';
import { type DashboardSetup, setUpDashboardProject } from './helpers/dashboard-fixtures';

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

/** The worker's role, to act on reports as the report_generate job does (report-pipeline). */
const WORKER_URL = 'postgresql://railgun_worker:worker_dev_password@localhost:5433/railgun';

describe('Reports (e2e, specs/report-generation)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let worker: Client;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    worker = new Client({ connectionString: WORKER_URL });
    await worker.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await worker.query(`DELETE FROM graphile_worker._private_jobs WHERE key LIKE 'report:%' AND locked_at IS NULL`);
    await worker.end();
    await app.close();
    await prisma.$disconnect();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());
  const ask = (s: DashboardSetup, body: Record<string, unknown>, token = s.viewer) =>
    api().post(`/projects/${s.projectId}/reports`).set(as(token)).send(body);
  const valid = { kind: 'bugs-dashboard', tz: 'Europe/Madrid', range: 30 };

  /** Runs SQL as the worker inside the workspace's tenant context. */
  async function asWorker(workspaceId: string, sql: string, params: unknown[]): Promise<void> {
    await worker.query('BEGIN');
    try {
      await worker.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceId]);
      await worker.query(sql, params);
      await worker.query('COMMIT');
    } catch (error) {
      await worker.query('ROLLBACK');
      throw error;
    }
  }

  async function markReady(s: DashboardSetup, reportId: string, bytes: Buffer): Promise<void> {
    await asWorker(s.workspaceId, `INSERT INTO report_file (report_id, workspace_id, content) VALUES ($1, $2, $3)`, [reportId, s.workspaceId, bytes]);
    await asWorker(
      s.workspaceId,
      `UPDATE report SET status = 'Ready', file_name = 'bugs-dashboard-2026-11-25.pdf', byte_size = $2, completed_at = now() WHERE id = $1`,
      [reportId, bytes.length],
    );
  }

  const jobsFor = async (reportId: string) =>
    Number((await worker.query(`SELECT count(*) AS n FROM graphile_worker._private_jobs WHERE key = $1`, [`report:${reportId}`])).rows[0].n);

  describe('requesting', () => {
    it('creates a Queued report for a Viewer and queues one job', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Ask');
      const response = await ask(s, valid);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ kind: 'bugs-dashboard', status: 'Queued', fileName: null });
      expect(await jobsFor(response.body.id)).toBe(1);
    });

    it('denies a member of another workspace with 403', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Deny');
      const other = await createWorkspaceWithProject(prisma, `Rep-Other-${Date.now()}`);
      const outsider = await setUpProjectMember(prisma, other.workspaceId, other.projectId, 'Admin');
      expect((await ask(s, valid, outsider)).status).toBe(403);
    });

    it.each([
      ['an unknown kind', { ...valid, kind: 'everything' }],
      ['an unknown time zone', { ...valid, tz: 'Mars/Olympus' }],
      ['range 45', { ...valid, range: 45 }],
    ])('refuses %s with 400 and creates nothing', async (_label, body) => {
      const s = await setUpDashboardProject(prisma, 'Rep-Bad');
      expect((await ask(s, body)).status).toBe(400);
      const count = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${s.workspaceId}, true)`;
        return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM report`;
      });
      expect(Number(count[0].n)).toBe(0);
    });
  });

  describe('reading and downloading', () => {
    it('shows the requester the status, and answers 404 to another member', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Own');
      const { id } = (await ask(s, valid)).body;
      const mine = await api().get(`/projects/${s.projectId}/reports/${id}`).set(as(s.viewer));
      expect(mine.status).toBe(200);
      expect(mine.body).toMatchObject({ id, status: 'Queued' });
      expect(mine.body).not.toHaveProperty('options');
      expect((await api().get(`/projects/${s.projectId}/reports/${id}`).set(as(s.admin))).status).toBe(404);
      expect((await api().get(`/projects/${s.projectId}/reports/${id}/file`).set(as(s.admin))).status).toBe(404);
    });

    it('answers 409 for the file of a report that is not Ready', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-409');
      const { id } = (await ask(s, valid)).body;
      await asWorker(s.workspaceId, `UPDATE report SET status = 'Generating' WHERE id = $1`, [id]);
      expect((await api().get(`/projects/${s.projectId}/reports/${id}/file`).set(as(s.viewer))).status).toBe(409);
    });

    it('downloads a Ready report as a PDF and logs the download in the feed', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-File');
      const { id } = (await ask(s, valid)).body;
      const bytes = Buffer.from('%PDF-1.7 test report');
      await markReady(s, id, bytes);

      const file = await api()
        .get(`/projects/${s.projectId}/reports/${id}/file`)
        .set(as(s.viewer))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['content-disposition']).toBe('attachment; filename="bugs-dashboard-2026-11-25.pdf"');
      expect(file.headers['content-length']).toBe(String(bytes.length));
      expect((file.body as Buffer).equals(bytes)).toBe(true);

      const feed = await api().get(`/projects/${s.projectId}/activity`).set(as(s.viewer));
      const entries = (feed.body.entries as { actionCode: string; entityName: string }[]).filter((e) => e.actionCode === 'report.downloaded');
      expect(entries).toHaveLength(1);
      expect(entries[0].entityName).toBe('Bugs dashboard report');
    });

    it('answers 404 once the report has expired', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Expired');
      const { id } = (await ask(s, valid)).body;
      await asWorker(s.workspaceId, `UPDATE report SET expires_at = now() - interval '1 day', created_at = now() - interval '8 days' WHERE id = $1`, [id]);
      expect((await api().get(`/projects/${s.projectId}/reports/${id}`).set(as(s.viewer))).status).toBe(404);
    });
  });

  describe('the Executions dashboard report (executions-dashboard-report)', () => {
    const executions = {
      kind: 'executions-dashboard',
      tz: 'UTC',
      filters: { status: 'Done' },
      runTable: { tab: 'all', outcome: null, day: null, name: '', sort: { key: 'updatedAt', direction: 'desc' } },
      ranges: { executionsOverTime: 30, runsOverTime: 7 },
      include: { executions: true, runs: true },
    };

    async function storedOptions(s: DashboardSetup, id: string) {
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${s.workspaceId}, true)`;
        return tx.$queryRaw<{ kind: string; options: Record<string, unknown> }[]>`SELECT kind, options FROM report WHERE id = ${id}::uuid`;
      });
      return rows[0];
    }

    it('accepts a filtered request and keeps its options', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Exec');
      const response = await ask(s, executions);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ kind: 'executions-dashboard', status: 'Queued' });
      const stored = await storedOptions(s, response.body.id);
      expect(stored.kind).toBe('executions_dashboard');
      expect(stored.options).toMatchObject({ filters: { status: 'Done' }, ranges: { executionsOverTime: 30, runsOverTime: 7 }, include: { executions: true, runs: true } });
    });

    it('refuses both switches off with 400 and creates nothing', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Exec-Off');
      expect((await ask(s, { ...executions, include: { executions: false, runs: false } })).status).toBe(400);
      const count = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${s.workspaceId}, true)`;
        return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM report`;
      });
      expect(Number(count[0].n)).toBe(0);
    });

    it('logs a download as the Executions dashboard report', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-Exec-File');
      const { id } = (await ask(s, executions)).body;
      await markReady(s, id, Buffer.from('%PDF-1.7 executions'));
      expect((await api().get(`/projects/${s.projectId}/reports/${id}/file`).set(as(s.viewer))).status).toBe(200);
      const feed = await api().get(`/projects/${s.projectId}/activity`).set(as(s.viewer));
      const entry = (feed.body.entries as { actionCode: string; entityName: string; category?: string }[]).find((e) => e.actionCode === 'report.downloaded');
      expect(entry?.entityName).toBe('Executions dashboard report');
    });
  });

  describe('the Test Cases dashboard report (test-cases-dashboard-report)', () => {
    const testCases = {
      kind: 'test-cases-dashboard',
      tz: 'UTC',
      ranges: { overTime: 30, passRate: 7 },
      needsAttention: { name: 'pay', sort: { key: 'updatedAt', direction: 'desc' } },
    };

    async function storedReports(s: DashboardSetup) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${s.workspaceId}, true)`;
        return tx.$queryRaw<{ kind: string; options: Record<string, unknown> }[]>`SELECT kind, options FROM report`;
      });
    }

    it('accepts a request and keeps its options', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-TC');
      const response = await ask(s, testCases);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ kind: 'test-cases-dashboard', status: 'Queued' });
      expect(await jobsFor(response.body.id)).toBe(1);
      const [stored] = await storedReports(s);
      expect(stored.kind).toBe('test_cases_dashboard');
      expect(stored.options).toEqual({
        tz: 'UTC',
        ranges: { overTime: 30, passRate: 7 },
        needsAttention: { name: 'pay', sort: { key: 'updatedAt', direction: 'desc' } },
      });
    });

    it('refuses a sort by folder with 400 and creates nothing', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-TC-Bad');
      const body = { ...testCases, needsAttention: { name: '', sort: { key: 'folder', direction: 'asc' } } };
      expect((await ask(s, body)).status).toBe(400);
      expect(await storedReports(s)).toHaveLength(0);
    });

    it('logs a download as the Test Cases dashboard report, under Test Cases', async () => {
      const s = await setUpDashboardProject(prisma, 'Rep-TC-File');
      const { id } = (await ask(s, testCases)).body;
      await markReady(s, id, Buffer.from('%PDF-1.7 test cases'));
      expect((await api().get(`/projects/${s.projectId}/reports/${id}/file`).set(as(s.viewer))).status).toBe(200);
      const feed = await api().get(`/projects/${s.projectId}/activity`).set(as(s.viewer));
      const entry = (feed.body.entries as { actionCode: string; entityName: string }[]).find((e) => e.actionCode === 'report.downloaded');
      expect(entry?.entityName).toBe('Test Cases dashboard report');
      // The feed doesn't return the category, so read it from the stored entry.
      const [stored] = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${s.workspaceId}, true)`;
        return tx.$queryRaw<{ category: string }[]>`SELECT category FROM activity_entries WHERE action_code = 'report.downloaded'`;
      });
      expect(stored.category).toBe('Test Cases');
    });
  });
});
