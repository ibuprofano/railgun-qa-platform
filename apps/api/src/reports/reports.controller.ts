import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { withTenantContext } from '../common/tenant-context';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import { log } from '../common/activity-logger';
import { isUuid } from '../executions/execution-input';
import { loadActorDisplayName } from '../executions/execution-queries';
import { parseReportRequest, REPORT_KIND_LABELS } from './report-rules';
import { createReport, loadOwnReport, type ReportResponse } from './report-queries';
import { postgresReportStore } from './report-store';

/**
 * Reports (PRD §8; specs/report-generation; ADR 0006, ADR 0027): request one, follow its
 * status, download its file. A report is its requester's alone; anyone else gets 404.
 */
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async request(
    @Param('projectId') projectId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReportResponse> {
    const userId = request.auth!.userId;
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, userId, projectId);
    return withTenantContext(this.prisma, workspaceId, async (tx) => {
      const parsed = await parseReportRequest(tx, body ?? {});
      return createReport(tx, { workspaceId, projectId, userId }, parsed);
    });
  }

  @Get(':reportId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async status(
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReportResponse> {
    if (!isUuid(reportId)) {
      throw new NotFoundException('report not found');
    }
    const userId = request.auth!.userId;
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, userId, projectId);
    return withTenantContext(this.prisma, workspaceId, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rawKind, options, ...report } = await loadOwnReport(tx, projectId, userId, reportId);
      return report;
    });
  }

  /** The PDF itself; each download is logged in the same transaction (PRD §8). */
  @Get(':reportId/file')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async file(
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!isUuid(reportId)) {
      throw new NotFoundException('report not found');
    }
    const userId = request.auth!.userId;
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, userId, projectId);
    const displayName = await loadActorDisplayName(this.prisma, userId);
    const { bytes, fileName } = await withTenantContext(this.prisma, workspaceId, async (tx) => {
      const report = await loadOwnReport(tx, projectId, userId, reportId);
      if (report.status !== 'Ready' || !report.fileName) {
        throw new ConflictException(`report is ${report.status}, not Ready`);
      }
      const content = await postgresReportStore.read(tx, reportId);
      if (!content) {
        throw new NotFoundException('report file not found');
      }
      await log(tx, {
        workspaceId,
        projectId,
        actorUserId: userId,
        actorDisplayName: displayName,
        actionCode: 'report.downloaded',
        entityType: 'report',
        entityId: reportId,
        entityName: REPORT_KIND_LABELS[report.rawKind].name,
        category: REPORT_KIND_LABELS[report.rawKind].category,
        details: { kind: report.kind },
      });
      return { bytes: content, fileName: report.fileName };
    });
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(bytes.length),
    });
    return new StreamableFile(bytes);
  }
}
