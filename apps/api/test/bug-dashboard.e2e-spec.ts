import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { BugDashboardData, DashboardBug } from '@railgun-qa/reporting';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject } from './helpers/cross-tenant-harness';
import { setUpProjectMember } from './helpers/execution-fixtures';
import { type DashboardSetup, insertTag, insertTestCase, setUpDashboardProject } from './helpers/dashboard-fixtures';
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

describe('Bugs dashboard (e2e, specs/bug-metrics)', () => {
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
    request(app.getHttpServer()).get(`/projects/${s.projectId}/bugs/dashboard?tz=${encodeURIComponent(tz)}`).set(as(token));
  const body = async (s: DashboardSetup, tz = 'UTC'): Promise<BugDashboardData> => {
    const response = await read(s, tz);
    expect(response.status).toBe(200);
    return response.body as BugDashboardData;
  };
  const setUp = (label: string) => setUpDashboardProject(prisma, label);
  const bugOf = (data: BugDashboardData, id: string): DashboardBug => {
    const found = data.bugs.find((b) => b.id === id);
    expect(found).toBeDefined();
    return found!;
  };

  interface BugSpec {
    projectId?: string;
    status?: string;
    createdAt?: Date;
    resolvedAt?: Date | null;
    tagIds?: string[];
    deleted?: boolean;
  }

  async function insertBug(s: DashboardSetup, spec: BugSpec = {}): Promise<string> {
    const id = randomUUID();
    const createdAt = spec.createdAt ?? new Date();
    await withTenantContext(prisma, s.workspaceId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO bug (id, project_id, workspace_id, title, severity, status, reporter_id, reporter_display_name,
          created_at, updated_at, resolved_at, deleted_at, deleted_by)
        VALUES (${id}::uuid, ${spec.projectId ?? s.projectId}::uuid, ${s.workspaceId}::uuid, 'A bug', 'High',
          ${spec.status ?? 'Open'}, ${s.creator}::uuid, 'Creator', ${createdAt}, ${createdAt}, ${spec.resolvedAt ?? null},
          ${spec.deleted ? new Date() : null}, ${spec.deleted ? s.creator : null}::uuid)`;
      for (const tagId of spec.tagIds ?? []) {
        await tx.$executeRaw`INSERT INTO bug_tag (bug_id, tag_id, workspace_id) VALUES (${id}::uuid, ${tagId}::uuid, ${s.workspaceId}::uuid)`;
      }
    });
    return id;
  }

  describe('access', () => {
    it('a Viewer reads the rows; a member of another workspace gets 403', async () => {
      const s = await setUp('BugDash-Access');
      const other = await createWorkspaceWithProject(prisma, `BugDash-Other-${Date.now()}`);
      const outsider = await setUpProjectMember(prisma, other.workspaceId, other.projectId, 'Admin');

      const data = await body(s, 'Europe/Madrid');
      expect(Object.keys(data).sort()).toEqual(['bugs', 'now', 'tags', 'today']);
      expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(data.now))).toBe(false);
      expect((await read(s, 'UTC', outsider)).status).toBe(403);
    });

    it('is not read as a bug id, and refuses an unknown time zone', async () => {
      const s = await setUp('BugDash-Route');
      const response = await read(s);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bugs');
      expect((await read(s, 'Mars/Olympus')).status).toBe(400);
    });
  });

  describe('which bugs', () => {
    it('leaves out a trashed bug and a bug of another project in the same workspace', async () => {
      const s = await setUp('BugDash-Scope');
      const otherProject = randomUUID();
      await withTenantContext(prisma, s.workspaceId, (tx) =>
        tx.$executeRaw`INSERT INTO project (id, workspace_id, name, slug)
          VALUES (${otherProject}::uuid, ${s.workspaceId}::uuid, 'Other', ${`other-${otherProject.slice(0, 8)}`})`,
      );
      const live = await insertBug(s);
      await insertBug(s, { deleted: true });
      await insertBug(s, { projectId: otherProject });

      expect((await body(s)).bugs.map((b) => b.id)).toEqual([live]);
    });
  });

  describe('each row', () => {
    it('dates a 23:30 UTC creation to the next day in Madrid', async () => {
      const s = await setUp('BugDash-Zone');
      const id = await insertBug(s, { createdAt: new Date('2026-03-04T23:30:00Z') });
      expect(bugOf(await body(s, 'Europe/Madrid'), id).reportedOn).toBe('2026-03-05');
      expect(bugOf(await body(s, 'UTC'), id).reportedOn).toBe('2026-03-04');
    });

    it('gives an unresolved bug no resolution, and a resolved bug both', async () => {
      const s = await setUp('BugDash-Resolved');
      const open = await insertBug(s, { status: 'InProgress' });
      const resolved = await insertBug(s, {
        status: 'Closed',
        createdAt: new Date('2026-03-01T10:00:00Z'),
        resolvedAt: new Date('2026-03-03T10:00:00Z'),
      });
      const data = await body(s);
      expect(bugOf(data, open)).toMatchObject({ resolvedAt: null, resolvedOn: null });
      expect(bugOf(data, resolved)).toMatchObject({ resolvedAt: '2026-03-03T10:00:00.000Z', resolvedOn: '2026-03-03' });
    });
  });

  describe('tags', () => {
    it('lists the tags live bugs carry, with each bug\'s tag ids', async () => {
      const s = await setUp('BugDash-Tags');
      const used = await insertTag(prisma, s, 'checkout');
      const second = await insertTag(prisma, s, 'ui');
      const testCaseOnly = await insertTag(prisma, s, 'smoke');
      const trashedOnly = await insertTag(prisma, s, 'legacy');
      await insertTestCase(prisma, s, { name: 'Tagged test', tagIds: [testCaseOnly] });
      const tagged = await insertBug(s, { tagIds: [used, second] });
      await insertBug(s, { tagIds: [trashedOnly], deleted: true });

      const data = await body(s);
      expect(data.tags.map((t) => t.name)).toEqual(['checkout', 'ui']);
      expect(data.tags[0]).toEqual({ id: used, name: 'checkout', color: 'blue' });
      expect(bugOf(data, tagged).tagIds).toEqual([used, second].sort());
    });
  });
});
