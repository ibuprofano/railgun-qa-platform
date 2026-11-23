import { Controller, Get, Inject, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import { LiveEventsService, type StreamMessage } from './live-events.service';

export interface LiveStreamTiming {
  heartbeatMs: number;
  maxAgeMs: number;
}

export const LIVE_STREAM_TIMING = Symbol('LIVE_STREAM_TIMING');

/** A heartbeat well inside common 30-60 s proxy idle timeouts; the 5-minute close re-checks access. */
export const DEFAULT_LIVE_STREAM_TIMING: LiveStreamTiming = { heartbeatMs: 25_000, maxAgeMs: 5 * 60_000 };

/**
 * The project's server-sent event stream (specs/live-updates). A raw Express response
 * rather than @Sse(), so it can write heartbeat comments and close itself on a timer
 * (design.md decision 4). The guards run first, so a refusal is the usual 401/403 JSON.
 */
@Controller('projects/:projectId/events')
export class LiveEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveEventsService,
    @Inject(LIVE_STREAM_TIMING) private readonly timing: LiveStreamTiming,
  ) {}

  @Get()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async stream(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, request.auth!.userId, projectId);

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Stops nginx-style proxies from buffering the stream.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write('retry: 3000\n\n');
    response.write('event: ready\ndata: {}\n\n');

    const unsubscribe = this.live.subscribe(projectId, (message: StreamMessage) => {
      if (message.type === 'resync') {
        response.write('event: resync\ndata: {}\n\n');
        return;
      }
      // Subscriptions are keyed by project already; this is defence in depth (ADR 0003).
      if (message.workspaceId !== workspaceId) {
        return;
      }
      const { workspaceId: _omitted, ...payload } = message;
      response.write(`event: ${message.type}\ndata: ${JSON.stringify(payload)}\n\n`);
    });
    const heartbeat = setInterval(() => response.write(': ping\n\n'), this.timing.heartbeatMs);
    const maxAge = setTimeout(() => response.end(), this.timing.maxAgeMs);

    response.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(maxAge);
      unsubscribe();
    });
  }
}
