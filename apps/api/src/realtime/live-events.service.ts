import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Client } from 'pg';
import { LIVE_CHANNEL, parseLiveEvent, type LiveEvent } from './live-event';

/** What a stream receives: a live event, or `resync` when events may have been missed. */
export type StreamMessage = LiveEvent | { type: 'resync' };
export type Subscriber = (message: StreamMessage) => void;

/** The slice of `pg.Client` the listener uses, so tests can pass a fake. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: 'notification', listener: (message: { payload?: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface LiveEventsConfig {
  createClient: () => ListenClient;
  initialRetryMs: number;
  maxRetryMs: number;
  keepaliveMs: number;
}

export const LIVE_EVENTS_CONFIG = Symbol('LIVE_EVENTS_CONFIG');

const DEFAULT_CONFIG: LiveEventsConfig = {
  // LISTEN needs a direct, non-pooled connection (ADR 0005); REALTIME_DATABASE_URL
  // exists for hosts where DATABASE_URL goes through a transaction-mode pooler.
  createClient: () =>
    new Client({
      connectionString:
        process.env.REALTIME_DATABASE_URL ??
        process.env.DATABASE_URL ??
        'postgresql://railgun_app:app_dev_password@localhost:5433/railgun',
    }),
  initialRetryMs: 1_000,
  maxRetryMs: 30_000,
  keepaliveMs: 30_000,
};

/**
 * One LISTEN connection per API process, fanned out in memory to the streams open on
 * each project (design.md decision 3). When the connection drops it reconnects with
 * backoff and sends `resync` to every stream, since notifications sent meanwhile are lost.
 */
@Injectable()
export class LiveEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveEventsService.name);
  private readonly config: LiveEventsConfig;
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private client: ListenClient | null = null;
  private retryMs: number;
  private retryTimer: NodeJS.Timeout | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private hasConnected = false;
  private stopped = false;

  constructor(@Optional() @Inject(LIVE_EVENTS_CONFIG) config?: Partial<LiveEventsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryMs = this.config.initialRetryMs;
  }

  async onModuleInit(): Promise<void> {
    // Never blocks startup: if the database isn't reachable yet, the retry loop takes over.
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.clearTimers();
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
  }

  /** Delivers this project's events to `subscriber` until the returned function is called. */
  subscribe(projectId: string, subscriber: Subscriber): () => void {
    let set = this.subscribers.get(projectId);
    if (!set) {
      set = new Set();
      this.subscribers.set(projectId, set);
    }
    set.add(subscriber);
    return () => {
      set.delete(subscriber);
      if (set.size === 0 && this.subscribers.get(projectId) === set) {
        this.subscribers.delete(projectId);
      }
    };
  }

  subscriberCount(): number {
    let count = 0;
    for (const set of this.subscribers.values()) {
      count += set.size;
    }
    return count;
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const client = this.config.createClient();
    this.client = client;
    client.on('notification', (message) => this.dispatch(message.payload));
    client.on('error', (error) => this.handleLoss(client, error));
    client.on('end', () => this.handleLoss(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${LIVE_CHANNEL}`);
    } catch (error) {
      this.handleLoss(client, error as Error);
      return;
    }
    if (this.client !== client) {
      return;
    }
    this.retryMs = this.config.initialRetryMs;
    if (this.hasConnected) {
      this.broadcast({ type: 'resync' });
    }
    this.hasConnected = true;
    this.keepaliveTimer = setInterval(() => {
      client.query('SELECT 1').catch((error: Error) => this.handleLoss(client, error));
    }, this.config.keepaliveMs);
  }

  private handleLoss(client: ListenClient, error?: Error): void {
    // Ignore late events from a client already replaced, and losses during shutdown.
    if (this.stopped || this.client !== client) {
      return;
    }
    this.logger.warn(`Live events connection lost${error ? `: ${error.message}` : ''}; retrying in ${this.retryMs} ms`);
    this.client = null;
    this.clearTimers();
    client.end().catch(() => undefined);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, this.config.maxRetryMs);
  }

  private dispatch(payload: string | undefined): void {
    const event = parseLiveEvent(payload);
    if (!event) {
      this.logger.warn('Dropped a malformed live event notification');
      return;
    }
    for (const subscriber of this.subscribers.get(event.projectId) ?? []) {
      subscriber(event);
    }
  }

  private broadcast(message: StreamMessage): void {
    for (const set of this.subscribers.values()) {
      for (const subscriber of set) {
        subscriber(message);
      }
    }
  }

  private clearTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
