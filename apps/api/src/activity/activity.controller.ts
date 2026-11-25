import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { withTenantContext } from '../common/tenant-context';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import { listProjectActivity } from '../common/activity-log-reader';
import {
  type ActivityHistoryResponse,
  parseActivityType,
  parseHistoryCursor,
  toHistoryResponse,
} from '../common/activity-history';

/** The project-wide activity feed behind the Activity screen (PRD §6.6, specs/activity-log). */
@Controller('projects/:projectId/activity')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first, 20 per page; `type` narrows to one of the screen's filter pills. */
  @Get()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async list(
    @Param('projectId') projectId: string,
    @Query('type') type: unknown,
    @Query('before') before: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ActivityHistoryResponse> {
    const filter = parseActivityType(type);
    const cursor = parseHistoryCursor(before);
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, request.auth!.userId, projectId);
    return withTenantContext(this.prisma, workspaceId, async (tx) =>
      toHistoryResponse(await listProjectActivity(tx, { workspaceId, projectId, type: filter, before: cursor })),
    );
  }
}
