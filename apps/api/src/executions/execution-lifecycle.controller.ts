import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProjectRoleGuard } from '../common/project-role.guard';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { PrismaService } from '../common/prisma.service';
import { withTenantContext } from '../common/tenant-context';
import { resolveProjectWorkspaceId } from '../common/resolve-project-workspace';
import type { AuthenticatedRequest } from '../common/clerk-auth.guard';
import {
  completesExecution,
  type ExecutionStatus,
  type LifecycleAction,
  OUTCOME_EDITABLE_STATUSES,
  RESTARTABLE_STATUSES,
  restartMinRole,
  type RunOutcome,
  TRANSITIONS,
} from './execution-lifecycle';
import { ROLE_RANK } from '../common/project-role';
import { isUuid, parseOutcome, parseRunMode } from './execution-input';
import {
  type ExecutionActor,
  type ExecutionResponse,
  listRunAttempts,
  loadActorDisplayName,
  loadExecution,
  logExecutionActivity,
  type RunAttemptResponse,
} from './execution-queries';
import { autoCreateBugForRun } from '../bugs/bug-queries';
import { emitExecutionChanged, emitRunBugsChanged } from '../realtime/live-event';

/** Adds the current InProgress period to the accumulator (ADR 0005 timer model). */
const STOP_TIMER = Prisma.sql`
  elapsed_ms_accumulated = elapsed_ms_accumulated
    + COALESCE((EXTRACT(EPOCH FROM (now() - last_resumed_at)) * 1000)::bigint, 0),
  last_resumed_at = NULL
`;

/**
 * What each action writes besides `status`, plus an optional precondition checked in
 * the same UPDATE's WHERE clause and the message used when only that precondition
 * failed (design.md - State machine as one table-driven module plus conditional UPDATEs).
 */
interface ActionSql {
  set: (userId: string) => Prisma.Sql;
  precondition?: (executionId: string) => Prisma.Sql;
  preconditionMessage?: string;
}

const ACTION_SQL: Record<LifecycleAction, ActionSql> = {
  markReady: {
    set: () => Prisma.empty,
    // ADR 0012 decisions 4-5: every run's test case still exists and is still Ready.
    precondition: (executionId) => Prisma.sql`NOT EXISTS (
      SELECT 1 FROM test_run r LEFT JOIN test_case tc ON tc.id = r.test_case_id
      WHERE r.execution_id = ${executionId}::uuid
        AND (tc.id IS NULL OR tc.deleted_at IS NOT NULL OR tc.status <> 'Ready')
    )`,
    preconditionMessage: 'every test case in the execution must still exist and be Ready',
  },
  backToDraft: { set: () => Prisma.empty },
  runAll: {
    set: () => Prisma.sql`, started_at = now(), last_resumed_at = now()`,
    precondition: (executionId) => Prisma.sql`EXISTS (SELECT 1 FROM test_run WHERE execution_id = ${executionId}::uuid)`,
    preconditionMessage: 'add at least one test case before running the execution',
  },
  pause: { set: () => Prisma.sql`, ${STOP_TIMER}` },
  resume: { set: () => Prisma.sql`, last_resumed_at = now()` },
  signOff: {
    set: (userId) => Prisma.sql`, signed_off_at = now(), signed_off_by = ${userId}::uuid`,
    precondition: (executionId) => Prisma.sql`NOT EXISTS (
      SELECT 1 FROM test_run WHERE execution_id = ${executionId}::uuid AND outcome = 'NeedsReview'
    )`,
    preconditionMessage: 'resolve every Needs Review run to Pass or Fail before signing off',
  },
  // ADR 0019: from Paused, STOP_TIMER adds nothing (last_resumed_at is already null).
  cancel: { set: () => Prisma.sql`, ${STOP_TIMER}` },
};

/**
 * Lifecycle transitions and manual run outcomes (specs/test-execution-lifecycle).
 * Each transition is one conditional UPDATE guarded on the expected status, so of two
 * concurrent conflicting requests exactly one wins and the other gets 409.
 */
@Controller('projects/:projectId/executions/:executionId')
export class ExecutionLifecycleController {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: AuthenticatedRequest, projectId: string): Promise<ExecutionActor> {
    const userId = request.auth!.userId;
    const workspaceId = await resolveProjectWorkspaceId(this.prisma, userId, projectId);
    const displayName = await loadActorDisplayName(this.prisma, userId);
    return { workspaceId, projectId, userId, displayName };
  }

  private async transition(
    action: LifecycleAction,
    projectId: string,
    executionId: string,
    request: AuthenticatedRequest,
    afterTransition?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<ExecutionResponse> {
    if (!isUuid(executionId)) {
      throw new NotFoundException('execution not found');
    }
    const { from, to, actionCode } = TRANSITIONS[action];
    const sql = ACTION_SQL[action];
    const actor = await this.actor(request, projectId);

    return withTenantContext(this.prisma, actor.workspaceId, async (tx) => {
      const precondition = sql.precondition ? Prisma.sql`AND ${sql.precondition(executionId)}` : Prisma.empty;
      // Lock first so the status read here is the one the guarded UPDATE acts on: an action
      // with several source statuses (Cancel) logs which one it actually left.
      const [current] = await tx.$queryRaw<{ status: ExecutionStatus }[]>`
        SELECT status FROM test_execution
        WHERE id = ${executionId}::uuid AND project_id = ${projectId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      const [updated] = current
        ? await tx.$queryRaw<{ id: string; name: string }[]>`
            UPDATE test_execution
            SET status = ${to}, updated_at = now() ${sql.set(actor.userId)}
            WHERE id = ${executionId}::uuid AND project_id = ${projectId}::uuid
              AND deleted_at IS NULL AND status = ANY(${from}::text[]) ${precondition}
            RETURNING id, name
          `
        : [];

      if (!updated) {
        if (!current) {
          throw new NotFoundException('execution not found');
        }
        if (!from.includes(current.status)) {
          throw new ConflictException(`cannot ${action} an execution that is ${current.status}`);
        }
        throw new ConflictException(sql.preconditionMessage);
      }

      await afterTransition?.(tx);
      await logExecutionActivity(
        tx,
        actor,
        actionCode,
        { type: 'test_execution', id: updated.id, name: updated.name },
        { from: current.status, to },
      );
      await emitExecutionChanged(tx, actor, updated.id);
      return loadExecution(tx, projectId, executionId);
    });
  }

  @Post('mark-ready')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.markReady.minRole)
  markReady(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('markReady', projectId, executionId, request);
  }

  @Post('back-to-draft')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.backToDraft.minRole)
  backToDraft(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('backToDraft', projectId, executionId, request);
  }

  @Post('run-all')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.runAll.minRole)
  runAll(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
    @Body() body: { mode?: unknown },
    @Req() request: AuthenticatedRequest,
  ) {
    if (parseRunMode(body?.mode) === 'Automated') {
      throw new UnprocessableEntityException('Automated mode is currently unavailable; run the execution in Manual mode');
    }
    // Snapshot-on-start (PRD §6.3.4): one statement, same transaction as the status change.
    return this.transition('runAll', projectId, executionId, request, async (tx) => {
      await tx.$executeRaw`
        UPDATE test_run r
        SET test_case_name_snapshot = tc.name, gherkin_script_snapshot = tc.gherkin_script
        FROM test_case tc
        WHERE r.execution_id = ${executionId}::uuid AND tc.id = r.test_case_id
      `;
    });
  }

  @Post('pause')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.pause.minRole)
  pause(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('pause', projectId, executionId, request);
  }

  @Post('resume')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.resume.minRole)
  resume(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('resume', projectId, executionId, request);
  }

  @Post('sign-off')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.signOff.minRole)
  signOff(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('signOff', projectId, executionId, request);
  }

  @Post('cancel')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(TRANSITIONS.cancel.minRole)
  cancel(@Param('projectId') projectId: string, @Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.transition('cancel', projectId, executionId, request);
  }

  /**
   * Restart (ADR 0020): Completed, Done or Canceled → Ready for a new attempt. One
   * transaction under the execution's row lock (the lock outcome writes take), in the
   * order of design.md decision 2: keep every run's result as an attempt, drop runs whose
   * test case is gone, close up positions, reset the rest, then reset the execution.
   */
  @Post('restart')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Contributor')
  async restart(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ExecutionResponse> {
    if (!isUuid(executionId)) {
      throw new NotFoundException('execution not found');
    }
    const actor = await this.actor(request, projectId);
    const role = request.auth!.projectRole!;

    return withTenantContext(this.prisma, actor.workspaceId, async (tx) => {
      const [execution] = await tx.$queryRaw<
        { id: string; name: string; status: ExecutionStatus; attempt: number; elapsed_ms_accumulated: bigint }[]
      >`
        SELECT id, name, status, attempt, elapsed_ms_accumulated FROM test_execution
        WHERE id = ${executionId}::uuid AND project_id = ${projectId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (!execution) {
        throw new NotFoundException('execution not found');
      }
      if (!RESTARTABLE_STATUSES.includes(execution.status)) {
        throw new ConflictException(`cannot restart an execution that is ${execution.status}`);
      }
      if (ROLE_RANK[role] < ROLE_RANK[restartMinRole(execution.status)]) {
        throw new ForbiddenException('only a Project Admin can restart a signed-off execution');
      }

      // A run is dropped when its test case is in the trash or purged (ADR 0020 decision 5).
      const gone = Prisma.sql`NOT EXISTS (
        SELECT 1 FROM test_case tc WHERE tc.id = r.test_case_id AND tc.deleted_at IS NULL
      )`;
      const [{ kept, dropped }] = await tx.$queryRaw<{ kept: bigint; dropped: bigint }[]>`
        SELECT COUNT(*) FILTER (WHERE NOT ${gone}) AS kept, COUNT(*) FILTER (WHERE ${gone}) AS dropped
        FROM test_run r WHERE r.execution_id = ${executionId}::uuid
      `;
      if (Number(kept) === 0) {
        throw new ConflictException('every test case in this execution was deleted; duplicate it with other test cases instead');
      }

      await tx.$executeRaw`
        INSERT INTO test_run_attempt (
          workspace_id, execution_id, test_run_id, test_case_id, attempt, position, outcome,
          outcome_updated_at, outcome_updated_by_name, test_case_name_snapshot, gherkin_script_snapshot
        )
        SELECT r.workspace_id, r.execution_id, r.id, r.test_case_id, ${execution.attempt}::integer, r.position, r.outcome,
               r.outcome_updated_at, r.outcome_updated_by_name, r.test_case_name_snapshot, r.gherkin_script_snapshot
        FROM test_run r WHERE r.execution_id = ${executionId}::uuid
      `;
      await tx.$executeRaw`DELETE FROM test_run r WHERE r.execution_id = ${executionId}::uuid AND ${gone}`;
      // Positions are unique per execution but deferred, so renumbering in one statement is safe.
      await tx.$executeRaw`
        UPDATE test_run SET position = t.ord,
          outcome = 'Pending', outcome_updated_at = NULL, outcome_updated_by = NULL, outcome_updated_by_name = NULL,
          test_case_name_snapshot = NULL, gherkin_script_snapshot = NULL
        FROM (
          SELECT id, row_number() OVER (ORDER BY position, id) AS ord
          FROM test_run WHERE execution_id = ${executionId}::uuid
        ) t
        WHERE test_run.id = t.id
      `;
      await tx.$executeRaw`
        UPDATE test_execution
        SET status = 'Ready', attempt = attempt + 1, elapsed_ms_accumulated = 0, last_resumed_at = NULL,
            started_at = NULL, completed_at = NULL, signed_off_at = NULL, signed_off_by = NULL, updated_at = now()
        WHERE id = ${executionId}::uuid
      `;

      await logExecutionActivity(
        tx,
        actor,
        'test_execution.restarted',
        { type: 'test_execution', id: execution.id, name: execution.name },
        {
          from: execution.status,
          to: 'Ready',
          elapsedMs: Number(execution.elapsed_ms_accumulated),
          attempt: execution.attempt + 1,
          droppedRuns: Number(dropped),
        },
      );
      await emitExecutionChanged(tx, actor, execution.id);
      return loadExecution(tx, projectId, executionId);
    });
  }

  /** A run's earlier attempts, newest first (ADR 0020 decision 4). */
  @Get('runs/:runId/attempts')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Viewer')
  async runAttempts(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
    @Param('runId') runId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RunAttemptResponse[]> {
    if (!isUuid(executionId) || !isUuid(runId)) {
      throw new NotFoundException('run not found');
    }
    const actor = await this.actor(request, projectId);
    return withTenantContext(this.prisma, actor.workspaceId, (tx) => listRunAttempts(tx, projectId, executionId, runId));
  }

  /**
   * Records a manual outcome. Locks the execution row first so outcome writes on one
   * execution are serialized — otherwise two testers recording the last two outcomes
   * could each still see the other's run as Pending and neither would complete it.
   */
  @Patch('runs/:runId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('Contributor')
  async setOutcome(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
    @Param('runId') runId: string,
    @Body() body: { outcome?: unknown },
    @Req() request: AuthenticatedRequest,
  ): Promise<ExecutionResponse> {
    const outcome = parseOutcome(body?.outcome);
    if (!isUuid(executionId) || !isUuid(runId)) {
      throw new NotFoundException('run not found');
    }
    const actor = await this.actor(request, projectId);

    return withTenantContext(this.prisma, actor.workspaceId, async (tx) => {
      const [execution] = await tx.$queryRaw<
        { id: string; name: string; status: ExecutionStatus; auto_create_bug: boolean }[]
      >`
        SELECT id, name, status, auto_create_bug FROM test_execution
        WHERE id = ${executionId}::uuid AND project_id = ${projectId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (!execution) {
        throw new NotFoundException('execution not found');
      }
      if (!OUTCOME_EDITABLE_STATUSES.includes(execution.status)) {
        throw new ConflictException(`outcomes cannot be recorded while the execution is ${execution.status}`);
      }

      const [run] = await tx.$queryRaw<{ outcome: RunOutcome; name: string | null }[]>`
        SELECT r.outcome, COALESCE(r.test_case_name_snapshot, tc.name) AS name
        FROM test_run r LEFT JOIN test_case tc ON tc.id = r.test_case_id
        WHERE r.id = ${runId}::uuid AND r.execution_id = ${executionId}::uuid
      `;
      if (!run) {
        throw new NotFoundException('run not found');
      }

      await tx.$executeRaw`
        UPDATE test_run
        SET outcome = ${outcome}, outcome_updated_at = now(), outcome_updated_by = ${actor.userId}::uuid,
            outcome_updated_by_name = ${actor.displayName ?? 'Unknown user'}
        WHERE id = ${runId}::uuid
      `;
      await tx.$executeRaw`UPDATE test_execution SET updated_at = now() WHERE id = ${executionId}::uuid`;
      await logExecutionActivity(
        tx,
        actor,
        'test_run.outcome_set',
        { type: 'test_run', id: runId, name: run.name ?? '(deleted test case)' },
        { executionId, from: run.outcome, to: outcome },
      );
      // ADR 0013 decision 2: same transaction, at most once per run (DB-enforced).
      if (outcome === 'Fail' && execution.auto_create_bug && (await autoCreateBugForRun(tx, actor, runId))) {
        await emitRunBugsChanged(tx, actor, executionId, runId);
      }

      const [{ pending }] = await tx.$queryRaw<{ pending: bigint }[]>`
        SELECT COUNT(*) AS pending FROM test_run WHERE execution_id = ${executionId}::uuid AND outcome = 'Pending'
      `;
      if (completesExecution(execution.status, Number(pending))) {
        await tx.$executeRaw`
          UPDATE test_execution
          SET status = 'Completed', completed_at = now(), updated_at = now(), ${STOP_TIMER}
          WHERE id = ${executionId}::uuid
        `;
        await logExecutionActivity(
          tx,
          actor,
          'test_execution.completed',
          { type: 'test_execution', id: executionId, name: execution.name },
          { from: 'InProgress', to: 'Completed' },
        );
      }
      await emitExecutionChanged(tx, actor, executionId);

      return loadExecution(tx, projectId, executionId);
    });
  }
}
