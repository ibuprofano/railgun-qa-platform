import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { ExecutionFilters } from '@railgun-qa/reporting';
import { ExecutionDashboard } from './execution-dashboard';
import { getExecutionDashboard } from '../../lib/executions-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeDashboardData, makeDashboardExecution, makeDashboardRun } from '../../test/execution-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/executions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/executions-api')>()),
  getExecutionDashboard: vi.fn(),
}));
vi.mock('../../lib/tags-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tags-api')>()),
  listTags: vi.fn(async () => []),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(async () => ({ entries: [], nextCursor: null })),
}));

/** The screen's role: it keeps the list filters the dashboard follows. */
function Harness({ initial = {}, onChange }: { initial?: ExecutionFilters; onChange?: (f: ExecutionFilters) => void }) {
  const [filters, setFilters] = useState<ExecutionFilters>(initial);
  return (
    <ExecutionDashboard
      projectId="p1"
      filters={filters}
      onFiltersChange={(next) => {
        onChange?.(next);
        setFilters(next);
      }}
    />
  );
}

const tile = (name: string) => screen.getByRole('region', { name });

/** 3 executions (1 Paused), 12 runs: 6 Pass, 1 Fail, 1 Needs Review, 4 Pending. */
function tileData() {
  const executions = [
    makeDashboardExecution({ id: 'e1', status: 'Paused', environmentName: 'Staging' }),
    makeDashboardExecution({ id: 'e2', status: 'Done', environmentName: 'Staging' }),
    makeDashboardExecution({ id: 'e3', status: 'Draft', environmentName: 'Prod' }),
  ];
  const outcomes = ['Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Pass', 'Fail', 'NeedsReview'] as const;
  const runs = [
    ...outcomes.map((outcome, i) => makeDashboardRun({ executionId: i < 4 ? 'e1' : 'e2', outcome, completedOn: '2026-11-24' })),
    ...Array.from({ length: 4 }, () => makeDashboardRun({ executionId: 'e3' })),
  ];
  return makeDashboardData({ executions, runs });
}

describe('ExecutionDashboard (specs/executions-screen)', () => {
  beforeEach(() => {
    vi.mocked(getExecutionDashboard).mockReset().mockResolvedValue(tileData());
  });

  it("reads the dashboard in the browser's zone, and again each time it is shown", async () => {
    const { rerender } = renderWithProviders(<Harness />);
    await screen.findByRole('region', { name: 'Executions' });
    expect(vi.mocked(getExecutionDashboard).mock.calls[0][2]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

    rerender(<p>An execution&apos;s detail</p>);
    rerender(<Harness />);

    await waitFor(() => expect(getExecutionDashboard).toHaveBeenCalledTimes(2));
  });

  it('shows tile and chart placeholders while loading, with History already shown', async () => {
    vi.mocked(getExecutionDashboard).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Harness />);

    expect(screen.getAllByTestId('dashboard-tile-placeholder')).toHaveLength(4);
    expect(screen.getAllByTestId('dashboard-chart-placeholder')).toHaveLength(4);
    expect(screen.getByRole('region', { name: 'History' })).toBeTruthy();
  });

  it('shows the empty state with no download button in a project with no executions', async () => {
    vi.mocked(getExecutionDashboard).mockResolvedValue(makeDashboardData({ executions: [], runs: [] }));
    renderWithProviders(<Harness />);

    expect(await screen.findByText('No executions yet')).toBeTruthy();
    expect(screen.getByText('Create an execution to start seeing metrics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it('reads the tiles: 3 "1 active", 12 "8 completed", 75% "6 of 8 runs", and "—"', async () => {
    renderWithProviders(<Harness />);
    await screen.findByRole('region', { name: 'Executions' });

    expect(tile('Executions').textContent).toContain('3');
    expect(tile('Executions').textContent).toContain('1 active');
    expect(tile('Total Runs').textContent).toContain('12');
    expect(tile('Total Runs').textContent).toContain('8 completed');
    expect(tile('Pass Rate').textContent).toContain('75%');
    expect(tile('Pass Rate').textContent).toContain('6 of 8 runs');
    expect(tile('Avg Duration').textContent).toContain('—');
    expect(tile('Avg Duration').textContent).toContain('per test run');
  });

  it('follows an environment filter, names it, and clears it', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={{ environmentName: 'Staging' }} onChange={onChange} />);
    await screen.findByRole('region', { name: 'Executions' });

    expect(tile('Executions').textContent).toContain('2');
    expect(tile('Total Runs').textContent).toContain('8');
    const notice = screen.getByRole('note', { name: 'Dashboard scope' });
    expect(notice.textContent).toContain('Environment: Staging');

    fireEvent.click(within(notice).getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenCalledWith({});
    expect(screen.queryByRole('note', { name: 'Dashboard scope' })).toBeNull();
    expect(tile('Executions').textContent).toContain('3');
  });

  it('colours execution statuses: Draft grey, In Progress blue, Canceled muted red', async () => {
    vi.mocked(getExecutionDashboard).mockResolvedValue(
      makeDashboardData({
        executions: [
          makeDashboardExecution({ id: 'a', status: 'Draft' }),
          makeDashboardExecution({ id: 'b', status: 'InProgress' }),
          makeDashboardExecution({ id: 'c', status: 'Canceled' }),
        ],
      }),
    );
    renderWithProviders(<Harness />);
    const donut = await screen.findByRole('figure', { name: 'Execution Status' });

    expect(donut.querySelector('[data-part="Draft"]')!.getAttribute('fill')).toBe('var(--status-draft)');
    expect(donut.querySelector('[data-part="InProgress"]')!.getAttribute('fill')).toBe('var(--status-in-progress)');
    expect(donut.querySelector('[data-part="Canceled"]')!.getAttribute('fill')).toBe('var(--status-canceled)');
  });

  it('gives each chart its own range', async () => {
    renderWithProviders(<Harness />);
    const runs = await screen.findByRole('figure', { name: 'Runs Over Time' });
    const executions = screen.getByRole('figure', { name: 'Executions Over Time' });

    fireEvent.click(within(runs).getByRole('radio', { name: '7d' }));

    expect(within(runs).getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    expect(within(executions).getByRole('radio', { name: '30d' }).getAttribute('aria-checked')).toBe('true');
  });

  it('selecting Done in Execution Status sets the status filter, and selecting it again clears it', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    const donut = await screen.findByRole('figure', { name: 'Execution Status' });

    fireEvent.click(within(donut).getByRole('button', { name: /^Done/ }));

    expect(onChange).toHaveBeenLastCalledWith({ status: 'Done' });
    expect(screen.getByRole('note', { name: 'Dashboard scope' }).textContent).toContain('Status: Done');
    expect(tile('Executions').textContent).toContain('1');

    fireEvent.click(within(screen.getByRole('figure', { name: 'Execution Status' })).getByRole('button', { name: /^Done/ }));

    expect(onChange).toHaveBeenLastCalledWith({ status: undefined });
    expect(screen.queryByRole('note', { name: 'Dashboard scope' })).toBeNull();
  });
});
