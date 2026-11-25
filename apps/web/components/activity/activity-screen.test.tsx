import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ActivityScreen } from './activity-screen';
import { listProjectActivity, type ActivityEntry } from '../../lib/activity-api';
import { useSessionContext } from '../../lib/session-context';
import { renderWithProviders } from '../../test/render-with-providers';

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/activity',
  useSearchParams: () => search,
}));
vi.mock('../../lib/session-context', () => ({ useSessionContext: vi.fn() }));
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(),
}));

// Thursday 26 Nov 2026, 15:00 local time.
const NOW = new Date(2026, 10, 26, 15);
const at = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(36).slice(2),
  actorName: 'Ana',
  actionCode: 'test_run.outcome_set',
  entityType: 'test_run',
  entityId: 'r1',
  entityName: 'Login',
  details: { from: 'Pending', to: 'Fail' },
  createdAt: at(26, 14),
  ...overrides,
});

describe('ActivityScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    replace.mockReset();
    search = new URLSearchParams();
    vi.mocked(useSessionContext).mockReturnValue({
      data: { workspaceId: 'w1', projectId: 'p1', projectName: 'Project', role: 'Viewer' },
      loading: false,
    } as unknown as ReturnType<typeof useSessionContext>);
    vi.mocked(listProjectActivity).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups entries under day headings and reads each as a sentence', async () => {
    vi.mocked(listProjectActivity).mockResolvedValue({
      entries: [
        entry({ createdAt: at(26, 14) }),
        entry({ actorName: null, actionCode: 'bug.purged', entityType: 'bug', entityName: 'Old', details: {}, createdAt: at(25, 9) }),
        entry({ actionCode: 'folder.created', entityType: 'folder', entityName: 'Checkout', details: {}, createdAt: at(23, 9) }),
        entry({ actionCode: 'bug.created', entityType: 'bug', entityName: 'Older', details: {}, createdAt: at(10, 9) }),
      ],
      nextCursor: null,
    });

    renderWithProviders(<ActivityScreen />);

    const today = await screen.findByRole('region', { name: 'Today' });
    expect(within(today).getByText('AN')).toBeTruthy();
    expect(within(today).getByText('set run “Login” to Fail')).toBeTruthy();
    expect(within(today).getByLabelText('Run')).toBeTruthy();
    const yesterday = screen.getByRole('region', { name: 'Yesterday' });
    expect(within(yesterday).getByText('System')).toBeTruthy();
    expect(within(yesterday).getByText('permanently removed bug “Old” from the trash').className).toContain('text-fail');
    const monday = new Date(2026, 10, 23).toLocaleDateString(undefined, { weekday: 'long' });
    expect(within(screen.getByRole('region', { name: monday })).getByText('created folder “Checkout”').className).toContain('text-pass');
    const older = new Date(2026, 10, 10).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    expect(screen.getByRole('region', { name: older })).toBeTruthy();
    expect(listProjectActivity).toHaveBeenCalledWith(expect.anything(), 'p1', null, null);
  });

  it('shows an entry whose action it has no sentence for', async () => {
    vi.mocked(listProjectActivity).mockResolvedValue({
      entries: [entry({ actionCode: 'widget.frobbed', entityType: 'widget', entityName: 'W', details: {} })],
      nextCursor: null,
    });

    renderWithProviders(<ActivityScreen />);

    expect(await screen.findByText('widget.frobbed “W”')).toBeTruthy();
  });

  it('selecting a pill narrows the feed and keeps it in the address', async () => {
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [entry({})], nextCursor: null });
    const { rerender } = renderWithProviders(<ActivityScreen />);
    await screen.findByText('set run “Login” to Fail');
    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Bugs' }));
    expect(replace).toHaveBeenCalledWith('/activity?type=bugs');

    // The router updates the search params; the screen refetches with the filter.
    search = new URLSearchParams('type=bugs');
    rerender(<ActivityScreen />);

    await waitFor(() => expect(listProjectActivity).toHaveBeenCalledWith(expect.anything(), 'p1', 'bugs', null));
    expect(screen.getByRole('radio', { name: 'Bugs' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('false');
  });

  it('opens with the filter from the address', async () => {
    search = new URLSearchParams('type=runs');
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [entry({})], nextCursor: null });

    renderWithProviders(<ActivityScreen />);

    await screen.findByText('set run “Login” to Fail');
    expect(screen.getByRole('radio', { name: 'Runs' }).getAttribute('aria-checked')).toBe('true');
    expect(listProjectActivity).toHaveBeenCalledWith(expect.anything(), 'p1', 'runs', null);
  });

  it('loads older entries on demand, then hides the button', async () => {
    vi.mocked(listProjectActivity)
      .mockResolvedValueOnce({ entries: [entry({ entityName: 'First' })], nextCursor: 'c1' })
      .mockResolvedValueOnce({ entries: [entry({ entityName: 'Second', createdAt: at(26, 10) })], nextCursor: null });

    renderWithProviders(<ActivityScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('set run “Second” to Fail')).toBeTruthy();
    expect(screen.getByText('set run “First” to Fail')).toBeTruthy();
    expect(listProjectActivity).toHaveBeenLastCalledWith(expect.anything(), 'p1', null, 'c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('says when there is no activity at all, or none of the selected type', async () => {
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [], nextCursor: null });
    const { unmount } = renderWithProviders(<ActivityScreen />);
    expect(await screen.findByText('No activity yet')).toBeTruthy();
    unmount();

    search = new URLSearchParams('type=tags');
    renderWithProviders(<ActivityScreen />);
    expect(await screen.findByText('No activity of this type')).toBeTruthy();
  });

  it('shows an error with a working Retry', async () => {
    vi.mocked(listProjectActivity)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ entries: [entry({})], nextCursor: null });

    renderWithProviders(<ActivityScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Retry/ }));

    expect(await screen.findByText('set run “Login” to Fail')).toBeTruthy();
  });
});
