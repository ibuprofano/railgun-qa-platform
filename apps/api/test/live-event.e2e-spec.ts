import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { startLiveListener, type LiveListener } from './helpers/live-listener';
import { withTenantContext } from '../src/common/tenant-context';
import { emitLiveEvent, parseLiveEvent } from '../src/realtime/live-event';

describe('emitLiveEvent (live-updates: events only when the change commits)', () => {
  let prisma: PrismaClient;
  let listener: LiveListener;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    listener = await startLiveListener();
  });

  afterAll(async () => {
    await listener.close();
    await prisma.$disconnect();
  });

  const event = () => ({
    type: 'execution.changed' as const,
    workspaceId: randomUUID(),
    projectId: randomUUID(),
    executionId: randomUUID(),
  });

  it('delivers exactly one notification with the payload when the transaction commits', async () => {
    const sent = event();
    await withTenantContext(prisma, sent.workspaceId, (tx) => emitLiveEvent(tx, sent));

    const received = (await listener.take()).filter((e) => 'executionId' in e && e.executionId === sent.executionId);
    expect(received).toEqual([sent]);
  });

  it('delivers nothing when the transaction rolls back', async () => {
    const sent = event();
    await expect(
      withTenantContext(prisma, sent.workspaceId, async (tx) => {
        await emitLiveEvent(tx, sent);
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');

    const received = (await listener.take()).filter((e) => 'executionId' in e && e.executionId === sent.executionId);
    expect(received).toEqual([]);
  });

  it('parseLiveEvent rejects malformed payloads', () => {
    expect(parseLiveEvent(undefined)).toBeNull();
    expect(parseLiveEvent('not json')).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ type: 'execution.changed', projectId: 'p' }))).toBeNull();
    expect(
      parseLiveEvent(JSON.stringify({ type: 'run.bugs.changed', workspaceId: 'w', projectId: 'p', executionId: 'e' })),
    ).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ type: 'other', workspaceId: 'w', projectId: 'p', executionId: 'e' }))).toBeNull();
  });

  it('parseLiveEvent accepts report.changed with its report id, and nothing else (report-pipeline)', () => {
    const event = { type: 'report.changed', workspaceId: 'w', projectId: 'p', reportId: 'r' };
    expect(parseLiveEvent(JSON.stringify(event))).toEqual(event);
    expect(parseLiveEvent(JSON.stringify({ type: 'report.changed', workspaceId: 'w', projectId: 'p' }))).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ type: 'report.changed', workspaceId: 'w', projectId: 'p', executionId: 'e' }))).toBeNull();
  });
});
