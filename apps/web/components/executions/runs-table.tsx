'use client';

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import type { Run } from '../../lib/executions-api';
import { dropResult, useListSensors } from '../../lib/sortable-list';
import type { OutcomeFilter } from './stats-bar';
import { OutcomeBadge } from './status-badge';
import { cn } from '@/lib/utils';

export interface RunsTableProps {
  runs: Run[];
  filter: OutcomeFilter;
  onSelectRun: (runId: string) => void;
  /** Draft + Contributor or above + no filter: rows get a drag handle (ADR 0014). */
  reorderable?: boolean;
  /** A drop: `runId` now comes right after `afterRunId` (null = first). */
  onMove?: (runId: string, afterRunId: string | null) => void;
  /** Draft + Contributor or above: rows get a remove button (ADR 0021 decision 3). */
  removable?: boolean;
  onRemove?: (runId: string) => void;
  /** Disables the remove buttons, e.g. while a removal is saving. */
  removing?: boolean;
}

const LAST_RUN_REASON = 'A Draft execution needs at least one test case';

/** Runs in position order (API order), narrowed by the stats-bar filter. */
export function RunsTable({
  runs,
  filter,
  onSelectRun,
  reorderable = false,
  onMove,
  removable = false,
  onRemove,
  removing = false,
}: RunsTableProps) {
  const sensors = useListSensors();
  const visible = filter === null ? runs : runs.filter((run) => run.outcome === filter);
  const ids = visible.map((run) => run.id);

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs to show.</p>;
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const result = over ? dropResult(ids, String(active.id), String(over.id)) : null;
    if (result) {
      onMove?.(String(active.id), result.afterId);
    }
  };

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          {reorderable && <th className="w-8 py-2 font-normal" aria-label="Reorder" />}
          <th className="w-12 py-2 font-normal">#</th>
          <th className="py-2 font-normal">Test case</th>
          <th className="w-36 py-2 font-normal">Status</th>
          {removable && <th className="w-10 py-2 font-normal" aria-label="Remove" />}
        </tr>
      </thead>
      <tbody>
        {visible.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            reorderable={reorderable}
            onSelect={() => onSelectRun(run.id)}
            remove={
              removable
                ? { onRemove: () => onRemove?.(run.id), disabledReason: runs.length === 1 ? LAST_RUN_REASON : null, busy: removing }
                : null
            }
          />
        ))}
      </tbody>
    </table>
  );

  if (!reorderable) {
    return table;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {table}
      </SortableContext>
    </DndContext>
  );
}

interface RemoveControl {
  onRemove: () => void;
  /** Why removing is unavailable (the last run), or null when it is allowed. */
  disabledReason: string | null;
  busy: boolean;
}

function RunRow({
  run,
  reorderable,
  onSelect,
  remove,
}: {
  run: Run;
  reorderable: boolean;
  onSelect: () => void;
  remove: RemoveControl | null;
}) {
  const name = run.testCaseName ?? 'Unknown test case';
  const cells = (
    <>
      <td className="py-2 tabular-nums">{run.position}</td>
      <td className="py-2">
        <button type="button" className="text-left hover:underline" onClick={onSelect}>
          {name}
        </button>
        {run.testCaseDeleted && <span className="ml-2 text-xs text-muted-foreground">(deleted test case)</span>}
      </td>
      <td className="py-2">
        <OutcomeBadge outcome={run.outcome} />
      </td>
      {remove && (
        <td className="py-2 text-right">
          <button
            type="button"
            aria-label={`Remove ${name}`}
            title={remove.disabledReason ?? `Remove ${name} from this execution`}
            disabled={remove.disabledReason !== null || remove.busy}
            onClick={remove.onRemove}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
          {remove.disabledReason && <span className="sr-only">{remove.disabledReason}</span>}
        </td>
      )}
    </>
  );

  if (!reorderable) {
    return <tr className="border-b last:border-0 hover:bg-muted">{cells}</tr>;
  }
  return <SortableRunRow id={run.id} name={name}>{cells}</SortableRunRow>;
}

function SortableRunRow({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      data-sortable-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('border-b bg-background last:border-0 hover:bg-muted', isDragging && 'relative z-10 shadow-md')}
    >
      <td className="py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${name}`}
          className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      {children}
    </tr>
  );
}
