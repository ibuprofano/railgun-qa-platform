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
  id: string;
  actionCode: string;
  entityType: string;
  entityName: string;
  actorName: string | null;
  createdAt: string;
}

describe('project activity feed (e2e, specs/activity-log)', () => {
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

  /** Writes an entry directly; `seconds` orders entries deterministically after now(). */
  async function insertEntry(
    workspaceId: string,
    projectId: string | null,
    entry: { actionCode: string; entityType: string; name: string; category: string; seconds: number; actor?: string },
  ): Promise<void> {
    await withTenantContext(prisma, workspaceId, (tx) =>
      tx.$executeRaw`
        INSERT INTO activity_entries (workspace_id, project_id, actor_user_id, actor_display_name, action_code,
          entity_type, entity_id, entity_name, category, created_at)
        VALUES (${workspaceId}::uuid, ${projectId}::uuid, NULL, ${entry.actor ?? null}, ${entry.actionCode},
          ${entry.entityType}, ${randomUUID()}::uuid, ${entry.name}, ${entry.category},
          now() + make_interval(secs => ${entry.seconds}))
      `,
    );
  }

  const feed = (s: Setup, query = '', token = s.viewer) => api().get(`/projects/${s.projectId}/activity${query}`).set(as(token));
  const codes = (body: { entries: Entry[] }) => body.entries.map((entry) => entry.actionCode);

  it('returns entries from every part of the project, newest first', async () => {
    const s = await setUp('Feed-All');
    const [testCaseId] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Login']);
    await api().patch(`/projects/${s.projectId}/test-cases/${testCaseId}`).set(as(s.contributor)).send({ name: 'Log in' });
    const execution = await api()
      .post(`/projects/${s.projectId}/executions`)
      .set(as(s.contributor))
      .send({ name: 'Smoke', testCaseIds: [testCaseId] });
    await api().post(`/projects/${s.projectId}/bugs`).set(as(s.contributor)).send({ title: 'Broken', severity: 'Low' });

    const response = await feed(s);

    expect(response.status).toBe(200);
    expect(codes(response.body)).toEqual(['bug.created', 'test_execution.created', 'test_case.updated']);
    expect(response.body.entries[1]).toMatchObject({ entityType: 'test_execution', entityName: 'Smoke' });
    expect(execution.status).toBe(201);
    expect(response.body.nextCursor).toBeNull();
  });

  it("excludes workspace entries and another project's entries", async () => {
    const s = await setUp('Feed-Exclude');
    const otherProjectId = randomUUID();
    await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO project (id, workspace_id, name, slug)
        VALUES (${otherProjectId}::uuid, ${s.workspaceId}::uuid, 'Other', ${`other-${otherProjectId.slice(0, 8)}`})`,
    );
    await insertEntry(s.workspaceId, s.projectId, { actionCode: 'bug.created', entityType: 'bug', name: 'Mine', category: 'Bugs', seconds: 1 });
    await insertEntry(s.workspaceId, null, {
      actionCode: 'workspace.renamed',
      entityType: 'workspace',
      name: 'Renamed',
      category: 'Workspace',
      seconds: 2,
    });
    await insertEntry(s.workspaceId, otherProjectId, {
      actionCode: 'test_case.created',
      entityType: 'test_case',
      name: 'Elsewhere',
      category: 'Test Cases',
      seconds: 3,
    });

    expect(codes((await feed(s)).body)).toEqual(['bug.created']);
  });

  it('reports system entries with no actor', async () => {
    const s = await setUp('Feed-System');
    await insertEntry(s.workspaceId, s.projectId, { actionCode: 'bug.purged', entityType: 'bug', name: 'Old', category: 'Bugs', seconds: 1 });

    const [entry] = (await feed(s)).body.entries as Entry[];

    expect(entry).toMatchObject({ actionCode: 'bug.purged', actorName: null });
  });

  describe('type filter', () => {
    async function mixedProject(label: string): Promise<Setup> {
      const s = await setUp(label);
      const rows = [
        { actionCode: 'test_execution.started', entityType: 'test_execution', name: 'Smoke', category: 'Executions' },
        { actionCode: 'test_run.outcome_set', entityType: 'test_run', name: 'Login', category: 'Executions' },
        { actionCode: 'test_run.outcome_set', entityType: 'test_run', name: 'Logout', category: 'Executions' },
        { actionCode: 'environment.updated', entityType: 'environment', name: 'Staging', category: 'Environments' },
        { actionCode: 'environment_credential.revealed', entityType: 'environment_credential', name: 'admin', category: 'Environments' },
        { actionCode: 'folder.created', entityType: 'folder', name: 'Checkout', category: 'Test Cases' },
        { actionCode: 'tag.created', entityType: 'tag', name: 'smoke', category: 'Test Cases' },
        { actionCode: 'project.renamed', entityType: 'project', name: 'Web', category: 'Projects' },
      ];
      for (const [index, row] of rows.entries()) {
        await insertEntry(s.workspaceId, s.projectId, { ...row, seconds: index + 1 });
      }
      return s;
    }

    it.each([
      ['runs', ['test_run.outcome_set', 'test_run.outcome_set']],
      ['environments', ['environment_credential.revealed', 'environment.updated']],
      ['executions', ['test_execution.started']],
      ['folders', ['folder.created']],
      ['tags', ['tag.created']],
      ['projects', ['project.renamed']],
      ['bugs', []],
    ])('?type=%s returns only its entries', async (type, expected) => {
      const s = await mixedProject(`Feed-Type-${type}`);

      const response = await feed(s, `?type=${type}`);

      expect(response.status).toBe(200);
      expect(codes(response.body)).toEqual(expected);
    });

    it('counts a delete and its restore under the item’s own type', async () => {
      const s = await setUp('Feed-Restore');
      const folder = (await api().post(`/projects/${s.projectId}/folders`).set(as(s.contributor)).send({ name: 'Checkout' })).body.id;
      await api().delete(`/projects/${s.projectId}/folders/${folder}`).set(as(s.admin));
      expect((await api().post(`/projects/${s.projectId}/trash/folder/${folder}/restore`).set(as(s.admin))).status).toBe(200);

      expect(codes((await feed(s, '?type=folders')).body)).toEqual(['folder.restored', 'folder.deleted', 'folder.created']);
    });

    it('rejects an unknown type (400)', async () => {
      const s = await setUp('Feed-BadType');

      expect((await feed(s, '?type=workspace')).status).toBe(400);
    });
  });

  describe('paging', () => {
    it('pages 25 entries as 20 plus 5, with no cursor at the end', async () => {
      const s = await setUp('Feed-Page');
      for (let i = 0; i < 25; i += 1) {
        await insertEntry(s.workspaceId, s.projectId, { actionCode: 'bug.updated', entityType: 'bug', name: `B${i}`, category: 'Bugs', seconds: i + 1 });
      }

      const first = await feed(s);
      const second = await feed(s, `?before=${first.body.nextCursor}`);

      expect(first.body.entries).toHaveLength(20);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(second.body.entries).toHaveLength(5);
      expect(second.body.nextCursor).toBeNull();
      expect((first.body.entries as Entry[])[0].entityName).toBe('B24');
      expect((second.body.entries as Entry[])[4].entityName).toBe('B0');
    });

    it('pages a filtered feed without gaps or repeats', async () => {
      const s = await setUp('Feed-PageFiltered');
      for (let i = 0; i < 30; i += 1) {
        const bug = i % 2 === 0;
        await insertEntry(s.workspaceId, s.projectId, {
          actionCode: bug ? 'bug.updated' : 'test_case.updated',
          entityType: bug ? 'bug' : 'test_case',
          name: `${bug ? 'Bug' : 'Case'} ${i}`,
          category: bug ? 'Bugs' : 'Test Cases',
          seconds: i + 1,
        });
      }
      // Entries sharing one timestamp must still page by id without loss.
      for (let i = 0; i < 6; i += 1) {
        await insertEntry(s.workspaceId, s.projectId, { actionCode: 'bug.updated', entityType: 'bug', name: `Tie ${i}`, category: 'Bugs', seconds: 100 });
      }

      const first = await feed(s, '?type=bugs');
      const second = await feed(s, `?type=bugs&before=${first.body.nextCursor}`);
      const all = [...first.body.entries, ...second.body.entries] as Entry[];

      expect(first.body.entries).toHaveLength(20);
      expect(second.body.nextCursor).toBeNull();
      expect(all).toHaveLength(21);
      expect(new Set(all.map((entry) => entry.id)).size).toBe(21);
      expect(all.every((entry) => entry.entityType === 'bug')).toBe(true);
    });

    it('rejects a malformed cursor (400)', async () => {
      const s = await setUp('Feed-BadCursor');

      expect((await feed(s, '?before=nonsense')).status).toBe(400);
    });
  });

  it('denies a caller with no access, including another workspace’s member (403)', async () => {
    const s = await setUp('Feed-Access');
    const outsider = await setUpProjectMember(prisma, s.workspaceId, s.projectId, null);
    const other = await setUp('Feed-Access-Other');

    expect((await feed(s, '', outsider)).status).toBe(403);
    expect((await api().get(`/projects/${s.projectId}/activity`).set(as(other.viewer))).status).toBe(403);
  });
});
