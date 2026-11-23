import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { insertTestCases, setUpProjectMember, sleep } from './helpers/execution-fixtures';
import { withTenantContext } from '../src/common/tenant-context';
import { LIVE_STREAM_TIMING } from '../src/realtime/live-events.controller';
import { LiveEventsService } from '../src/realtime/live-events.service';

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

const HEARTBEAT_MS = 100;
const MAX_AGE_MS = 2_500;

interface Frame {
  event?: string;
  data?: string;
  comment?: string;
}

/** An open stream read frame by frame, so a test can wait for (or rule out) a frame. */
interface OpenStream {
  status: number;
  contentType: string | null;
  frames: Frame[];
  ended: Promise<void>;
  waitFor(match: (frame: Frame) => boolean, timeoutMs?: number): Promise<Frame>;
  close(): void;
}

function parseFrame(block: string): Frame {
  const frame: Frame = {};
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trim();
    } else if (line.startsWith('event: ')) {
      frame.event = line.slice('event: '.length);
    } else if (line.startsWith('data: ')) {
      frame.data = line.slice('data: '.length);
    }
  }
  return frame;
}

describe('live updates stream (e2e, specs/live-updates)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl: string;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LIVE_STREAM_TIMING)
      .useValue({ heartbeatMs: HEARTBEAT_MS, maxAgeMs: MAX_AGE_MS })
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function open(projectId: string, token?: string): Promise<OpenStream> {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/projects/${projectId}/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    const frames: Frame[] = [];
    const waiters: (() => void)[] = [];
    const ended = (async () => {
      if (!response.ok || !response.body) {
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) {
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            frames.push(parseFrame(buffer.slice(0, boundary)));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
          }
          waiters.splice(0).forEach((wake) => wake());
        }
      } catch {
        // Aborted by close().
      }
    })();

    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      frames,
      ended,
      async waitFor(match, timeoutMs = 2_000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const found = frames.find(match);
          if (found) {
            return found;
          }
          if (Date.now() > deadline) {
            throw new Error(`no matching frame within ${timeoutMs} ms; got ${JSON.stringify(frames)}`);
          }
          await Promise.race([new Promise<void>((resolve) => waiters.push(resolve)), sleep(50)]);
        }
      },
      close() {
        controller.abort();
      },
    };
  }

  const eventsOf = (stream: OpenStream) => stream.frames.filter((f) => f.event && f.event !== 'ready');

  /** A started execution in its own workspace, with a Contributor to drive it and a Viewer to watch. */
  async function startedExecution(label: string) {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    const contributor = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Contributor');
    const viewer = await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer');
    const testCaseIds = await insertTestCases(prisma, f.workspaceId, f.projectId, ['A', 'B']);
    const call = (method: string, path: string, body?: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${contributor}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const created = (await (await call('POST', `/projects/${f.projectId}/executions`, { name: label, testCaseIds })).json()) as {
      id: string;
      runs: { id: string }[];
    };
    const base = `/projects/${f.projectId}/executions/${created.id}`;
    await call('POST', `${base}/mark-ready`);
    await call('POST', `${base}/run-all`, { mode: 'Manual' });
    const recordOutcome = () => call('PATCH', `${base}/runs/${created.runs[0].id}`, { outcome: 'Pass' });
    return { ...f, contributor, viewer, executionId: created.id, recordOutcome };
  }

  async function secondProjectIn(f: WorkspaceFixture): Promise<string> {
    const projectId = randomUUID();
    await withTenantContext(prisma, f.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO project (id, workspace_id, name, slug)
        VALUES (${projectId}::uuid, ${f.workspaceId}::uuid, 'Second', ${`second-${projectId.slice(0, 8)}`})`,
    );
    return projectId;
  }

  it('a Viewer opens the stream: 200, text/event-stream, and a ready event', async () => {
    const s = await startedExecution('Live-Open');
    const stream = await open(s.projectId, s.viewer);
    try {
      expect(stream.status).toBe(200);
      expect(stream.contentType).toMatch(/^text\/event-stream/);
      await stream.waitFor((f) => f.event === 'ready');
    } finally {
      stream.close();
    }
  });

  it('refuses a missing token with 401 and a non-member with 403', async () => {
    const s = await startedExecution('Live-Refused');
    const outsider = await setUpProjectMember(prisma, s.workspaceId, s.projectId, null);

    const anonymous = await open(s.projectId);
    const nonMember = await open(s.projectId, outsider);

    expect(anonymous.status).toBe(401);
    expect(nonMember.status).toBe(403);
    expect(nonMember.contentType).toMatch(/json/);
  });

  it('a run outcome recorded through the API reaches the open stream, identifiers only', async () => {
    const s = await startedExecution('Live-Outcome');
    const stream = await open(s.projectId, s.viewer);
    try {
      await stream.waitFor((f) => f.event === 'ready');

      expect((await s.recordOutcome()).status).toBe(200);
      const frame = await stream.waitFor((f) => f.event === 'execution.changed');

      expect(JSON.parse(frame.data!)).toEqual({
        type: 'execution.changed',
        projectId: s.projectId,
        executionId: s.executionId,
      });
    } finally {
      stream.close();
    }
  });

  it('nothing reaches a stream on another project of the same workspace, or on another workspace', async () => {
    const s = await startedExecution('Live-Isolation');
    const sibling = await secondProjectIn(s);
    const siblingViewer = await setUpProjectMember(prisma, s.workspaceId, sibling, 'Viewer');
    const other = await startedExecution('Live-OtherTenant');
    const own = await open(s.projectId, s.viewer);
    const siblingStream = await open(sibling, siblingViewer);
    const otherStream = await open(other.projectId, other.viewer);
    try {
      await Promise.all([own, siblingStream, otherStream].map((st) => st.waitFor((f) => f.event === 'ready')));

      await s.recordOutcome();
      await own.waitFor((f) => f.event === 'execution.changed');
      await sleep(200);

      expect(eventsOf(siblingStream)).toEqual([]);
      expect(eventsOf(otherStream)).toEqual([]);
    } finally {
      [own, siblingStream, otherStream].forEach((st) => st.close());
    }
  });

  it('sends heartbeats while idle and closes itself after the max age', async () => {
    const s = await startedExecution('Live-Heartbeat');
    const stream = await open(s.projectId, s.viewer);
    try {
      await stream.waitFor((f) => f.comment === 'ping', HEARTBEAT_MS * 5);
      const closedWithin = await Promise.race([stream.ended.then(() => 'closed'), sleep(MAX_AGE_MS + 1_500).then(() => 'open')]);

      expect(closedWithin).toBe('closed');
    } finally {
      stream.close();
    }
  });

  it('closing the client unsubscribes it', async () => {
    const live = app.get(LiveEventsService);
    const s = await startedExecution('Live-Unsubscribe');
    const before = live.subscriberCount();
    const stream = await open(s.projectId, s.viewer);
    await stream.waitFor((f) => f.event === 'ready');
    expect(live.subscriberCount()).toBe(before + 1);

    stream.close();
    for (let i = 0; i < 20 && live.subscriberCount() !== before; i++) {
      await sleep(50);
    }

    expect(live.subscriberCount()).toBe(before);
  });
});
