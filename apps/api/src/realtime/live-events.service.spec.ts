import { EventEmitter } from 'events';
import { LiveEventsService, type ListenClient, type StreamMessage } from './live-events.service';

/** A stand-in for pg.Client: records queries and lets the test emit notifications or drop the connection. */
class FakeClient extends EventEmitter implements ListenClient {
  queries: string[] = [];
  failConnect = false;
  ended = false;

  async connect() {
    if (this.failConnect) {
      throw new Error('connection refused');
    }
  }

  async query(sql: string) {
    this.queries.push(sql);
  }

  async end() {
    this.ended = true;
  }

  notify(payload: unknown) {
    this.emit('notification', { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }
}

const event = (projectId: string) => ({
  type: 'execution.changed' as const,
  workspaceId: 'w1',
  projectId,
  executionId: 'e1',
});

describe('LiveEventsService (design.md decision 3)', () => {
  let clients: FakeClient[];
  let service: LiveEventsService;

  function makeService(nextClient: () => FakeClient = () => new FakeClient()) {
    clients = [];
    service = new LiveEventsService({
      createClient: () => {
        const client = nextClient();
        clients.push(client);
        return client;
      },
      initialRetryMs: 10,
      maxRetryMs: 40,
      keepaliveMs: 60_000,
    });
  }

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('LISTENs on the live channel once connected', async () => {
    makeService();
    await service.onModuleInit();

    expect(clients).toHaveLength(1);
    expect(clients[0].queries).toEqual(['LISTEN railgun_live']);
  });

  it('dispatches each event only to the subscribers of its project', async () => {
    makeService();
    await service.onModuleInit();
    const p1: StreamMessage[] = [];
    const p2: StreamMessage[] = [];
    service.subscribe('p1', (m) => p1.push(m));
    service.subscribe('p2', (m) => p2.push(m));

    clients[0].notify(event('p1'));

    expect(p1).toEqual([event('p1')]);
    expect(p2).toEqual([]);
  });

  it('drops malformed payloads without throwing', async () => {
    makeService();
    await service.onModuleInit();
    const received: StreamMessage[] = [];
    service.subscribe('p1', (m) => received.push(m));

    clients[0].notify('not json');
    clients[0].notify({ type: 'execution.changed', projectId: 'p1' });

    expect(received).toEqual([]);
  });

  it('unsubscribing stops delivery and the count returns to 0', async () => {
    makeService();
    await service.onModuleInit();
    const received: StreamMessage[] = [];
    const unsubscribe = service.subscribe('p1', (m) => received.push(m));
    expect(service.subscriberCount()).toBe(1);

    unsubscribe();
    clients[0].notify(event('p1'));

    expect(received).toEqual([]);
    expect(service.subscriberCount()).toBe(0);
  });

  it('after a connection loss it reconnects and sends resync to every subscriber', async () => {
    jest.useFakeTimers();
    makeService();
    await service.onModuleInit();
    const p1: StreamMessage[] = [];
    const p2: StreamMessage[] = [];
    service.subscribe('p1', (m) => p1.push(m));
    service.subscribe('p2', (m) => p2.push(m));

    clients[0].emit('error', new Error('socket closed'));
    await jest.advanceTimersByTimeAsync(10);

    expect(clients).toHaveLength(2);
    expect(clients[0].ended).toBe(true);
    expect(clients[1].queries).toEqual(['LISTEN railgun_live']);
    expect(p1).toEqual([{ type: 'resync' }]);
    expect(p2).toEqual([{ type: 'resync' }]);

    clients[1].notify(event('p1'));
    expect(p1).toEqual([{ type: 'resync' }, event('p1')]);
  });

  it('retries a failed first connection with doubling delays, and does not resync on the first success', async () => {
    jest.useFakeTimers();
    let attempt = 0;
    makeService(() => {
      const client = new FakeClient();
      client.failConnect = attempt++ < 2;
      return client;
    });
    const received: StreamMessage[] = [];
    service.subscribe('p1', (m) => received.push(m));

    await service.onModuleInit();
    expect(clients).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(10);
    expect(clients).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(10);
    expect(clients).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(10);
    expect(clients).toHaveLength(3);

    expect(clients[2].queries).toEqual(['LISTEN railgun_live']);
    expect(received).toEqual([]);
  });

  it('a failed keepalive counts as a lost connection', async () => {
    jest.useFakeTimers();
    clients = [];
    service = new LiveEventsService({
      createClient: () => {
        const client = new FakeClient();
        clients.push(client);
        return client;
      },
      initialRetryMs: 10,
      maxRetryMs: 40,
      keepaliveMs: 100,
    });
    await service.onModuleInit();
    clients[0].query = async (sql: string) => {
      if (sql === 'SELECT 1') {
        throw new Error('timeout');
      }
    };

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(10);

    expect(clients).toHaveLength(2);
  });

  it('stops reconnecting after shutdown', async () => {
    jest.useFakeTimers();
    makeService();
    await service.onModuleInit();

    await service.onModuleDestroy();
    clients[0].emit('end');
    await jest.advanceTimersByTimeAsync(100);

    expect(clients).toHaveLength(1);
  });
});
