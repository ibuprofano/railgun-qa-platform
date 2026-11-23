import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ActivityHistory } from './activity-history';
import { renderWithProviders } from '../../test/render-with-providers';
import type { ActivityEntry, ActivityPage } from '../../lib/activity-api';

const entry = (id: string, actionCode: string, entityName: string, actorName: string | null = 'Ana'): ActivityEntry => ({
  id,
  actorName,
  actionCode,
  entityType: 'test_execution',
  entityId: 'e1',
  entityName,
  details: null,
  createdAt: '2026-11-23T10:00:00.000Z',
});

describe('ActivityHistory', () => {
  it('renders entries as sentences and appends older ones on Load more', async () => {
    const fetchPage = vi.fn(async (before: string | null): Promise<ActivityPage> =>
      before === null
        ? { entries: [entry('a2', 'test_execution.started', 'Smoke')], nextCursor: 'c1' }
        : { entries: [entry('a1', 'test_execution.created', 'Smoke', 'Bo')], nextCursor: null },
    );
    renderWithProviders(<ActivityHistory queryKey={['history', 'x']} fetchPage={fetchPage} label="Execution history" />);

    const section = await screen.findByRole('region', { name: 'Execution history' });
    expect(await within(section).findByText('started execution “Smoke”')).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(2));
    expect(within(section).getAllByRole('listitem').map((li) => li.textContent?.split('”')[0])).toEqual([
      'Ana started execution “Smoke',
      'Bo created execution “Smoke',
    ]);
    expect(fetchPage).toHaveBeenLastCalledWith('c1');
    expect(within(section).queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows an empty state', async () => {
    renderWithProviders(
      <ActivityHistory queryKey={['history', 'empty']} fetchPage={async () => ({ entries: [], nextCursor: null })} label="Bug history" />,
    );

    expect(await screen.findByText('No history yet.')).toBeTruthy();
  });
});
