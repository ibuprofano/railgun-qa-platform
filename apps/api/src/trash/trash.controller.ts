import { ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { withTenantContext } from '../common/tenant-context';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import { isUuid } from '../executions/execution-input';
import { type ExecutionActor, loadActorDisplayName } from '../executions/execution-queries';
import { isUniqueViolation } from '../folders/folder-queries';
import { isTrashType, listTrash, parseTrashType, type RestoredItem, restoreTrashItem, type TrashEntry } from './trash-queries';

/** The project's trash: list and restore, Project Admins only (PRD §6.11, ADR 0022, specs/trash-restore). */
@Controller('projects/:projectId/trash')
export class TrashController {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: AuthenticatedRequest, projectId: string): Promise<ExecutionActor> {
    const userId = request.auth!.userId;
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, userId, projectId);
    const displayName = await loadActorDisplayName(this.prisma, userId);
    return { workspaceId, projectId, userId, displayName };
  }

  /** One entry per deletion, most recently deleted first; `type` narrows to one item type. */
  @Get()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Admin')
  async list(
    @Param('projectId') projectId: string,
    @Query('type') type: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<TrashEntry[]> {
    const filter = parseTrashType(type);
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, request.auth!.userId, projectId);
    return withTenantContext(this.prisma, workspaceId, (tx) => listTrash(tx, projectId, filter));
  }

  /**
   * Brings a deletion back where it was, with the deletions of any trashed parent folders,
   * all in one transaction; a clash is a 409 and restores nothing (ADR 0022).
   */
  @Post(':type/:id/restore')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Admin')
  async restore(
    @Param('projectId') projectId: string,
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ restored: RestoredItem[] }> {
    if (!isTrashType(type) || !isUuid(id)) {
      throw new NotFoundException('item not found in the trash');
    }
    const actor = await this.actor(request, projectId);
    try {
      const restored = await withTenantContext(this.prisma, actor.workspaceId, (tx) => restoreTrashItem(tx, actor, type, id));
      return { restored };
    } catch (error) {
      // A race past the pre-checks (a sibling name or auto-filed bug created meanwhile).
      if (isUniqueViolation(error)) {
        throw new ConflictException('restoring this item would clash with an item created meanwhile; try again');
      }
      throw error;
    }
  }
}
