import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { insertTestCases, setUpProjectMember } from './helpers/execution-fixtures';
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

interface Entry {
  actionCode: string;
  entityType: string;
  entityId: string;
  entityName: string;
  actorName: string | null;
  details: unknown;
  createdAt: string;
}

describe('item histories (e2e, ADR 0021)', () => {
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
    contributor: string;
    admin: string;
    viewer: string;
  }

  async function setUp(label: string): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    return {
      ...f,
      contributor: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor'),
      admin: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin'),
      viewer: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer'),
    };
  }

  /** A started execution over `names`, with auto-create on; returns its base path and run ids. */
  async function startedExecution(s: Setup, name: string, names: string[]) {
    const ids = await insertTestCases(prisma, s.workspaceId, s.projectId, names);
    const created = await api()
      .post(`/projects/${s.projectId}/executions`)
      .set(as(s.contributor))
      .send({ name, testCaseIds: ids, autoCreateBug: true });
    const base = `/projects/${s.projectId}/executions/${created.body.id}`;
    await api().post(`${base}/mark-ready`).set(as(s.contributor));
    await api().post(`${base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
    return { id: created.body.id as string, base, runIds: created.body.runs.map((r: { id: string }) => r.id) as string[] };
  }

  const history = async (s: Setup, path: string, token = s.viewer) => api().get(`${path}/activity`).set(as(token));

  describe('execution history', () => {
    it('lists lifecycle, outcome and linked-bug entries, newest first, including later bug edits', async () => {
      const s = await setUp('Hist-Exec');
      const e = await startedExecution(s, 'Smoke', ['Login', 'Logout']);
      await api().patch(`${e.base}/runs/${e.runIds[0]}`).set(as(s.contributor)).send({ outcome: 'Fail' });
      const [bug] = (await api().get(`/projects/${s.projectId}/bugs?testRunId=${e.runIds[0]}`).set(as(s.viewer))).body;
      await api().patch(`/projects/${s.projectId}/bugs/${bug.id}`).set(as(s.contributor)).send({ status: 'Resolved' });
      await api().post(`${e.base}/cancel`).set(as(s.contributor));

      const response = await history(s, e.base);

      expect(response.status).toBe(200);
      const codes = (response.body.entries as Entry[]).map((entry) => entry.actionCode);
      expect(codes.slice(0, 2)).toEqual(['test_execution.canceled', 'bug.updated']);
      // The outcome and its auto-created bug share a transaction, so a timestamp: either order.
      expect(codes.slice(2, 4).sort()).toEqual(['bug.created', 'test_run.outcome_set']);
      expect(codes.slice(4)).toEqual(['test_execution.started', 'test_execution.marked_ready', 'test_execution.created']);
      expect(response.body.nextCursor).toBeNull();
      const outcome = (response.body.entries as Entry[]).find((entry) => entry.actionCode === 'test_run.outcome_set')!;
      expect(outcome).toMatchObject({ entityType: 'test_run', entityName: 'Login', details: { to: 'Fail' } });
      expect(outcome.actorName).toEqual(expect.any(String));
    });

    it("excludes another execution's entries, runs and bugs", async () => {
      const s = await setUp('Hist-Exclude');
      const mine = await startedExecution(s, 'Mine', ['A']);
      const other = await startedExecution(s, 'Other', ['B']);
      await api().patch(`${other.base}/runs/${other.runIds[0]}`).set(as(s.contributor)).send({ outcome: 'Fail' });

      const entries = (await history(s, mine.base)).body.entries as Entry[];

      expect(entries.every((entry) => entry.entityType === 'test_execution' && entry.entityId === mine.id)).toBe(true);
      expect(entries.map((entry) => entry.actionCode)).not.toContain('bug.created');
    });

    it('pages 25 entries as 20 plus 5, with no cursor at the end', async () => {
      const s = await setUp('Hist-Page');
      const e = await startedExecution(s, 'Paged', ['A']);
      await withTenantContext(prisma, s.workspaceId, async (tx) => {
        // 22 more on top of the 3 the lifecycle already wrote: created, marked_ready, started.
        for (let i = 0; i < 22; i += 1) {
          await tx.$executeRaw`
            INSERT INTO activity_entries (workspace_id, project_id, actor_user_id, actor_display_name, action_code,
              entity_type, entity_id, entity_name, category, created_at)
            VALUES (${s.workspaceId}::uuid, ${s.projectId}::uuid, NULL, NULL, 'test_execution.edited',
              'test_execution', ${e.id}::uuid, 'Paged', 'Executions', now() + make_interval(secs => ${i + 1}))
          `;
        }
      });

      const first = await history(s, e.base);
      const second = await api().get(`${e.base}/activity?before=${first.body.nextCursor}`).set(as(s.viewer));

      expect(first.body.entries).toHaveLength(20);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(second.body.entries).toHaveLength(5);
      expect(second.body.nextCursor).toBeNull();
      const all = [...first.body.entries, ...second.body.entries] as Entry[];
      expect(new Set(all.map((entry) => entry.createdAt + entry.actionCode)).size).toBeGreaterThan(20);
      expect(all[all.length - 1].actionCode).toBe('test_execution.created');
    });

    it('rejects a malformed cursor (400)', async () => {
      const s = await setUp('Hist-BadCursor');
      const e = await startedExecution(s, 'Cursor', ['A']);

      expect((await api().get(`${e.base}/activity?before=nonsense`).set(as(s.viewer))).status).toBe(400);
    });

    it('denies a caller with no access (403), and 404s another tenant’s execution', async () => {
      const s = await setUp('Hist-Access');
      const e = await startedExecution(s, 'Private', ['A']);
      const outsider = await setUpProjectMember(prisma, s.workspaceId, s.projectId, null);
      const other = await setUp('Hist-Access-Other');

      expect((await history(s, e.base, outsider)).status).toBe(403);
      const crossTenant = await api()
        .get(`/projects/${other.projectId}/executions/${e.id}/activity`)
        .set(as(other.viewer));
      expect(crossTenant.status).toBe(404);
    });
  });

  describe('bug history', () => {
    it('lists exactly its own entries, newest first', async () => {
      const s = await setUp('Hist-Bug');
      const e = await startedExecution(s, 'Smoke', ['A']);
      const bugs = `/projects/${s.projectId}/bugs`;
      const bug = (await api().post(bugs).set(as(s.contributor)).send({ title: 'Broken', severity: 'Low' })).body;
      await api().post(bugs).set(as(s.contributor)).send({ title: 'Unrelated', severity: 'Low' });
      await api().patch(`${bugs}/${bug.id}`).set(as(s.contributor)).send({ severity: 'High' });
      await api().post(`${bugs}/${bug.id}/link-run`).set(as(s.contributor)).send({ testRunId: e.runIds[0] });

      const response = await history(s, `${bugs}/${bug.id}`);

      expect(response.status).toBe(200);
      expect((response.body.entries as Entry[]).map((entry) => [entry.actionCode, entry.entityId])).toEqual([
        ['bug.linked', bug.id],
        ['bug.updated', bug.id],
        ['bug.created', bug.id],
      ]);
    });

    it('404s a deleted bug', async () => {
      const s = await setUp('Hist-BugDeleted');
      const bugs = `/projects/${s.projectId}/bugs`;
      const bug = (await api().post(bugs).set(as(s.contributor)).send({ title: 'Gone', severity: 'Low' })).body;
      await api().delete(`${bugs}/${bug.id}`).set(as(s.admin));

      expect((await history(s, `${bugs}/${bug.id}`)).status).toBe(404);
    });
  });
});
