import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { withTenantContext } from '../common/tenant-context';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import { loadOverview, type OverviewResponse } from './overview-queries';
import { loadTrends, type OverviewTrends, parseTimeZone } from './overview-trends';

/** The Overview dashboard's figures in one read (PRD §6.1, specs/project-metrics). */
@Controller('projects/:projectId/overview')
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async get(@Param('projectId') projectId: string, @Req() request: AuthenticatedRequest): Promise<OverviewResponse> {
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, request.auth!.userId, projectId);
    return withTenantContext(this.prisma, workspaceId, (tx) => loadOverview(tx, projectId));
  }

  /** 90 days of chart data; run and bug days follow `tz`, Health Score days are UTC (ADR 0024). */
  @Get('trends')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async trends(
    @Param('projectId') projectId: string,
    @Query('tz') tz: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<OverviewTrends> {
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, request.auth!.userId, projectId);
    return withTenantContext(this.prisma, workspaceId, async (tx) => loadTrends(tx, projectId, await parseTimeZone(tx, tz)));
  }
}
