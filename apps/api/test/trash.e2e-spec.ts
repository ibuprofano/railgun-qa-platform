import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { activityCodesFor, insertTestCases, setUpProjectMember } from './helpers/execution-fixtures';
import { insertTestUser, insertWorkspaceMembership } from './helpers/membership-fixtures';
import { startLiveListener, type LiveListener } from './helpers/live-listener';
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

interface TrashEntry {
  type: string;
  id: string;
  name: string;
  deletedAt: string;
  deletedByName: string | null;
  purgeAfter: string;
  daysLeft: number;
  folders?: number;
  testCases?: number;
}

interface TreeItem {
  id: string;
  name: string;
  folderId?: string | null;
  parentFolderId?: string | null;
  positionKey: string;
}

describe('trash list and restore (e2e, specs/trash-restore)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let live: LiveListener;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    live = await startLiveListener();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await live.close();
    await prisma.$disconnect();
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface Setup extends WorkspaceFixture {
    contributor: string;
    admin: string;
    viewer: string;
    owner: string;
  }

  async function setUp(label: string): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    const owner = `clerk-trash-owner-${randomUUID()}`;
    const ownerId = await insertTestUser(prisma, owner, 'Owner User');
    await insertWorkspaceMembership(prisma, f.workspaceId, ownerId, 'Owner');
    return {
      ...f,
      owner,
      contributor: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor'),
      admin: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin'),
      viewer: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer'),
    };
  }

  const p = (s: Setup) => `/projects/${s.projectId}`;
  const trash = (s: Setup, query = '', token = s.admin) => api().get(`${p(s)}/trash${query}`).set(as(token));
  const restore = (s: Setup, type: string, id: string, token = s.admin) =>
    api().post(`${p(s)}/trash/${type}/${id}/restore`).set(as(token));

  async function folder(s: Setup, name: string, parentFolderId: string | null = null): Promise<string> {
    const response = await api().post(`${p(s)}/folders`).set(as(s.contributor)).send({ name, parentFolderId });
    expect(response.status).toBe(201);
    return response.body.id;
  }

  async function testCase(s: Setup, name: string, folderId: string | null = null): Promise<string> {
    const response = await api().post(`${p(s)}/test-cases`).set(as(s.contributor)).send({ name, folderId });
    expect(response.status).toBe(201);
    return response.body.id;
  }

  async function remove(s: Setup, path: string): Promise<void> {
    expect((await api().delete(`${p(s)}/${path}`).set(as(s.admin))).status).toBe(204);
  }

  /** Moves every row of an item's deletion `days` (and `hours`) into the past. */
  async function backdate(s: Setup, table: 'bug' | 'test_execution' | 'test_case' | 'folder', id: string, days: number, hours = 0) {
    await withTenantContext(prisma, s.workspaceId, async (tx) => {
      const interval = `${days} days ${hours} hours`;
      if (table === 'folder') {
        await tx.$executeRaw`UPDATE folder SET deleted_at = now() - ${interval}::interval
          WHERE deletion_id = (SELECT deletion_id FROM folder WHERE id = ${id}::uuid)`;
        await tx.$executeRaw`UPDATE test_case SET deleted_at = now() - ${interval}::interval
          WHERE deletion_id = (SELECT deletion_id FROM folder WHERE id = ${id}::uuid)`;
      } else {
        await tx.$executeRaw`UPDATE ${Prisma.raw(table)} SET deleted_at = now() - ${interval}::interval WHERE id = ${id}::uuid`;
      }
    });
  }

  const testCases = async (s: Setup) => (await api().get(`${p(s)}/test-cases`).set(as(s.viewer))).body as TreeItem[];
  const folders = async (s: Setup) => (await api().get(`${p(s)}/folders`).set(as(s.viewer))).body as TreeItem[];
  const namesIn = (items: TreeItem[], parent: string | null, key: 'folderId' | 'parentFolderId') =>
    items
      .filter((item) => (item[key] ?? null) === parent)
      .sort((a, b) => (a.positionKey < b.positionKey ? -1 : a.positionKey > b.positionKey ? 1 : 0))
      .map((item) => item.name);

  async function codesSince(s: Setup, since: Date): Promise<string[]> {
    const rows = await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$queryRaw<{ action_code: string }[]>`
        SELECT action_code FROM activity_entries WHERE project_id = ${s.projectId}::uuid AND created_at >= ${since}
        ORDER BY created_at, id`,
    );
    return rows.map((row) => row.action_code);
  }

  async function deletionIds(s: Setup, ids: string[]): Promise<(string | null)[]> {
    const rows = await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$queryRaw<{ deletion_id: string | null }[]>`
        SELECT deletion_id FROM folder WHERE id = ANY(${ids}::uuid[])
        UNION ALL SELECT deletion_id FROM test_case WHERE id = ANY(${ids}::uuid[])`,
    );
    return rows.map((row) => row.deletion_id);
  }

  /** A started execution over `names`, auto-create on; returns its base path and run ids. */
  async function startedExecution(s: Setup, name: string, names: string[]) {
    const ids = await insertTestCases(prisma, s.workspaceId, s.projectId, names);
    const created = await api().post(`${p(s)}/executions`).set(as(s.contributor)).send({ name, testCaseIds: ids, autoCreateBug: true });
    const base = `${p(s)}/executions/${created.body.id}`;
    await api().post(`${base}/mark-ready`).set(as(s.contributor));
    await api().post(`${base}/run-all`).set(as(s.contributor)).send({ mode: 'Manual' });
    return { id: created.body.id as string, base, runIds: created.body.runs.map((r: { id: string }) => r.id) as string[] };
  }

  describe('list', () => {
    it('lists a folder delete as one entry with its counts', async () => {
      const s = await setUp('Trash-Folder');
      const checkout = await folder(s, 'Checkout');
      const cards = await folder(s, 'Cards', checkout);
      await testCase(s, 'Pay', checkout);
      await testCase(s, 'Refund', checkout);
      await testCase(s, 'Visa', cards);
      await remove(s, `folders/${checkout}`);

      const response = await trash(s);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        expect.objectContaining({ type: 'folder', id: checkout, name: 'Checkout', folders: 2, testCases: 3, deletedByName: 'Admin User' }),
      ]);
    });

    it('lists separate deletions separately, most recent first', async () => {
      const s = await setUp('Trash-Separate');
      const checkout = await folder(s, 'Checkout');
      const pay = await testCase(s, 'Pay', checkout);
      await remove(s, `test-cases/${pay}`);
      await remove(s, `folders/${checkout}`);

      const entries = (await trash(s)).body as TrashEntry[];

      expect(entries.map((entry) => [entry.type, entry.id])).toEqual([
        ['folder', checkout],
        ['test-case', pay],
      ]);
      expect(entries[0]).toMatchObject({ folders: 1, testCases: 0 });
      expect(entries[1]).not.toHaveProperty('folders');
    });

    it('reports the days left before removal, never below zero', async () => {
      const s = await setUp('Trash-Days');
      const bugs = `${p(s)}/bugs`;
      const recent = (await api().post(bugs).set(as(s.contributor)).send({ title: 'Recent', severity: 'Low' })).body.id;
      const due = (await api().post(bugs).set(as(s.contributor)).send({ title: 'Due', severity: 'Low' })).body.id;
      await remove(s, `bugs/${recent}`);
      await remove(s, `bugs/${due}`);
      await backdate(s, 'bug', recent, 10);
      await backdate(s, 'bug', due, 30, 2);

      const entries = (await trash(s)).body as TrashEntry[];

      expect(entries.map((entry) => [entry.name, entry.daysLeft])).toEqual([
        ['Recent', 20],
        ['Due', 0],
      ]);
      const first = entries[0];
      expect(new Date(first.purgeAfter).getTime() - new Date(first.deletedAt).getTime()).toBe(30 * 24 * 3600 * 1000);
    });

    it('filters by type and rejects an unknown type (400)', async () => {
      const s = await setUp('Trash-Filter');
      const bug = (await api().post(`${p(s)}/bugs`).set(as(s.contributor)).send({ title: 'Broken', severity: 'Low' })).body.id;
      const [tc] = await insertTestCases(prisma, s.workspaceId, s.projectId, ['Login']);
      const execution = (await api().post(`${p(s)}/executions`).set(as(s.contributor)).send({ name: 'Smoke', testCaseIds: [tc] })).body.id;
      await remove(s, `bugs/${bug}`);
      await remove(s, `executions/${execution}`);

      expect(((await trash(s, '?type=bug')).body as TrashEntry[]).map((entry) => entry.id)).toEqual([bug]);
      expect(((await trash(s, '?type=execution')).body as TrashEntry[]).map((entry) => entry.id)).toEqual([execution]);
      expect((await trash(s, '?type=project')).status).toBe(400);
    });

    it('is empty with nothing deleted', async () => {
      const s = await setUp('Trash-Empty');
      await testCase(s, 'Live');

      expect((await trash(s)).body).toEqual([]);
    });

    it('is for Admins only, including Workspace Owners without a membership', async () => {
      const s = await setUp('Trash-Access');

      expect((await trash(s, '', s.contributor)).status).toBe(403);
      expect((await trash(s, '', s.viewer)).status).toBe(403);
      expect((await trash(s, '', s.owner)).status).toBe(200);
    });
  });

  describe('restoring bugs and executions', () => {
    it('restores a bug with its run link, once', async () => {
      const s = await setUp('Restore-Bug');
      const e = await startedExecution(s, 'Smoke', ['Login']);
      const bugs = `${p(s)}/bugs`;
      const bug = (await api().post(bugs).set(as(s.contributor)).send({ title: 'Broken', severity: 'Low' })).body.id;
      await api().post(`${bugs}/${bug}/link-run`).set(as(s.contributor)).send({ testRunId: e.runIds[0] });
      await remove(s, `bugs/${bug}`);
      await live.take();

      const response = await restore(s, 'bug', bug);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ restored: [{ type: 'bug', id: bug, name: 'Broken' }] });
      const detail = await api().get(`${bugs}/${bug}`).set(as(s.viewer));
      expect(detail.status).toBe(200);
      expect(detail.body.run).toMatchObject({ id: e.runIds[0], executionId: e.id });
      expect(await activityCodesFor(prisma, s.workspaceId, bug)).toContain('bug.restored');
      const events = await live.take();
      expect(events).toContainEqual(expect.objectContaining({ type: 'run.bugs.changed', executionId: e.id, runId: e.runIds[0] }));
      expect((await restore(s, 'bug', bug)).status).toBe(404);
    });

    it('restores a Draft execution with its runs in order', async () => {
      const s = await setUp('Restore-Exec');
      const ids = await insertTestCases(prisma, s.workspaceId, s.projectId, ['A', 'B', 'C', 'D']);
      const created = (await api().post(`${p(s)}/executions`).set(as(s.contributor)).send({ name: 'Draft', testCaseIds: ids })).body;
      await remove(s, `executions/${created.id}`);
      await live.take();

      const response = await restore(s, 'execution', created.id);

      expect(response.status).toBe(200);
      const detail = await api().get(`${p(s)}/executions/${created.id}`).set(as(s.viewer));
      expect(detail.body.status).toBe('Draft');
      expect(detail.body.runs.map((run: { testCaseId: string }) => run.testCaseId)).toEqual(ids);
      expect(await live.take()).toContainEqual(expect.objectContaining({ type: 'execution.changed', executionId: created.id }));
    });

    it("404s another workspace's bug, an unknown type and a live item", async () => {
      const s = await setUp('Restore-404');
      const other = await setUp('Restore-404-Other');
      const foreign = (await api().post(`/projects/${other.projectId}/bugs`).set(as(other.contributor)).send({ title: 'Theirs', severity: 'Low' })).body.id;
      await api().delete(`/projects/${other.projectId}/bugs/${foreign}`).set(as(other.admin));
      const mine = (await api().post(`${p(s)}/bugs`).set(as(s.contributor)).send({ title: 'Live', severity: 'Low' })).body.id;

      expect((await restore(s, 'bug', foreign)).status).toBe(404);
      expect((await restore(s, 'project', mine)).status).toBe(404);
      expect((await restore(s, 'bug', mine)).status).toBe(404);
      expect(((await trash(other)).body as TrashEntry[]).map((entry) => entry.id)).toEqual([foreign]);
    });

    it('refuses a Contributor (403) and lets a Workspace Owner restore', async () => {
      const s = await setUp('Restore-Access');
      const bug = (await api().post(`${p(s)}/bugs`).set(as(s.contributor)).send({ title: 'Broken', severity: 'Low' })).body.id;
      await remove(s, `bugs/${bug}`);

      expect((await restore(s, 'bug', bug, s.contributor)).status).toBe(403);
      expect((await trash(s)).body).toHaveLength(1);
      expect((await restore(s, 'bug', bug, s.owner)).status).toBe(200);
    });

    it('refuses an auto-filed bug when the run attempt has another one (409), changing nothing', async () => {
      const s = await setUp('Restore-AutoBug');
      const e = await startedExecution(s, 'Smoke', ['Login', 'Logout']);
      const run = `${e.base}/runs/${e.runIds[0]}`;
      await api().patch(run).set(as(s.contributor)).send({ outcome: 'Fail' });
      const [first] = (await api().get(`${p(s)}/bugs?testRunId=${e.runIds[0]}`).set(as(s.viewer))).body;
      await remove(s, `bugs/${first.id}`);
      await api().patch(run).set(as(s.contributor)).send({ outcome: 'Pass' });
      await api().patch(run).set(as(s.contributor)).send({ outcome: 'Fail' });
      const linked = (await api().get(`${p(s)}/bugs?testRunId=${e.runIds[0]}`).set(as(s.viewer))).body;
      expect(linked).toHaveLength(1);
      const since = new Date();
      await live.take();

      const response = await restore(s, 'bug', first.id);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain(linked[0].title);
      expect((await trash(s)).body).toHaveLength(1);
      expect(await codesSince(s, since)).toEqual([]);
      // Other suites emit on the same channel in a full run: only this workspace's events count.
      expect((await live.take()).filter((event) => event.workspaceId === s.workspaceId)).toEqual([]);
    });
  });

  describe('restoring test cases and folders', () => {
    it('restores a folder tree whole, under its former parent', async () => {
      const s = await setUp('Restore-Tree');
      const shop = await folder(s, 'Shop');
      const checkout = await folder(s, 'Checkout', shop);
      const cards = await folder(s, 'Cards', checkout);
      const ids = [await testCase(s, 'Pay', checkout), await testCase(s, 'Refund', checkout), await testCase(s, 'Visa', cards)];
      await remove(s, `folders/${checkout}`);

      const response = await restore(s, 'folder', checkout);

      expect(response.status).toBe(200);
      expect(response.body.restored).toEqual([{ type: 'folder', id: checkout, name: 'Checkout' }]);
      const tree = await folders(s);
      expect(namesIn(tree, shop, 'parentFolderId')).toEqual(['Checkout']);
      expect(namesIn(tree, checkout, 'parentFolderId')).toEqual(['Cards']);
      expect(namesIn(await testCases(s), checkout, 'folderId')).toEqual(['Pay', 'Refund']);
      expect(await deletionIds(s, [checkout, cards, ...ids])).toEqual([null, null, null, null, null]);
      expect((await trash(s)).body).toEqual([]);
    });

    it("brings back a test case's trashed folder with everything that folder's delete took", async () => {
      const s = await setUp('Restore-Ancestor');
      const checkout = await folder(s, 'Checkout');
      const pay = await testCase(s, 'Pay', checkout);
      await testCase(s, 'Refund', checkout);
      await testCase(s, 'Cancel', checkout);
      await remove(s, `test-cases/${pay}`);
      await remove(s, `folders/${checkout}`);
      const since = new Date();

      const response = await restore(s, 'test-case', pay);

      expect(response.status).toBe(200);
      expect(response.body.restored).toEqual([
        { type: 'test-case', id: pay, name: 'Pay' },
        { type: 'folder', id: checkout, name: 'Checkout' },
      ]);
      expect(namesIn(await testCases(s), checkout, 'folderId')).toEqual(['Pay', 'Refund', 'Cancel']);
      // One transaction, one timestamp: the two entries' order is arbitrary.
      expect((await codesSince(s, since)).sort()).toEqual(['folder.restored', 'test_case.restored']);
      const [entry] = await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$queryRaw<{ details: Record<string, unknown> }[]>`
          SELECT details FROM activity_entries WHERE entity_id = ${checkout}::uuid AND action_code = 'folder.restored'`,
      );
      expect(entry.details).toMatchObject({ folders: 1, testCases: 2, restoredWith: { type: 'test-case', id: pay, name: 'Pay' } });
      expect((await trash(s)).body).toEqual([]);
    });

    it('leaves an earlier deletion inside the restored folder in the trash', async () => {
      const s = await setUp('Restore-Inner');
      const checkout = await folder(s, 'Checkout');
      const pay = await testCase(s, 'Pay', checkout);
      await testCase(s, 'Refund', checkout);
      await remove(s, `test-cases/${pay}`);
      await remove(s, `folders/${checkout}`);

      expect((await restore(s, 'folder', checkout)).status).toBe(200);

      expect(namesIn(await testCases(s), checkout, 'folderId')).toEqual(['Refund']);
      expect(((await trash(s)).body as TrashEntry[]).map((entry) => entry.id)).toEqual([pay]);
    });

    it('returns a test case to its former place when free, and last when taken', async () => {
      const s = await setUp('Restore-Position');
      const suite = await folder(s, 'Suite');
      await testCase(s, 'First', suite);
      const second = await testCase(s, 'Second', suite);
      await testCase(s, 'Third', suite);
      await remove(s, `test-cases/${second}`);
      await restore(s, 'test-case', second);
      expect(namesIn(await testCases(s), suite, 'folderId')).toEqual(['First', 'Second', 'Third']);

      const last = await testCase(s, 'Last', suite);
      await remove(s, `test-cases/${last}`);
      await testCase(s, 'Newer', suite); // takes the deleted one's key
      await restore(s, 'test-case', last);

      expect(namesIn(await testCases(s), suite, 'folderId')).toEqual(['First', 'Second', 'Third', 'Newer', 'Last']);
    });

    it('refuses a folder whose name a live sibling now uses (409), restoring nothing', async () => {
      const s = await setUp('Restore-Clash');
      const checkout = await folder(s, 'Checkout');
      await testCase(s, 'Pay', checkout);
      await remove(s, `folders/${checkout}`);
      await folder(s, 'checkout');
      const since = new Date();

      const response = await restore(s, 'folder', checkout);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('"checkout"');
      expect((await trash(s)).body).toHaveLength(1);
      expect(await codesSince(s, since)).toEqual([]);
    });

    it('refuses a test case when its trashed folder would clash (409)', async () => {
      const s = await setUp('Restore-AncestorClash');
      const checkout = await folder(s, 'Checkout');
      const pay = await testCase(s, 'Pay', checkout);
      await remove(s, `test-cases/${pay}`);
      await remove(s, `folders/${checkout}`);
      await folder(s, 'Checkout');

      expect((await restore(s, 'test-case', pay)).status).toBe(409);
      expect((await trash(s)).body).toHaveLength(2);
    });

    it('refuses a subtree whose parent moved too deep (409)', async () => {
      const s = await setUp('Restore-Depth');
      const a = await folder(s, 'A');
      const b = await folder(s, 'B', a); // level 2
      const c = await folder(s, 'C', b);
      await folder(s, 'D', c); // C + D: a two-level subtree under level 2
      await remove(s, `folders/${c}`);
      const top = await folder(s, 'Top');
      expect((await api().post(`${p(s)}/folders/${a}/move`).set(as(s.contributor)).send({ parentFolderId: top })).status).toBe(200);

      const response = await restore(s, 'folder', c);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('4-level');
      expect((await trash(s)).body).toHaveLength(1);
    });

    it('404s a test case deleted with its folder, restored by its own id', async () => {
      const s = await setUp('Restore-Member');
      const checkout = await folder(s, 'Checkout');
      const pay = await testCase(s, 'Pay', checkout);
      await remove(s, `folders/${checkout}`);

      expect((await restore(s, 'test-case', pay)).status).toBe(404);
      expect((await trash(s)).body).toHaveLength(1);
    });
  });
});

