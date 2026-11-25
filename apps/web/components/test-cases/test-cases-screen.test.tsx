import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { TestCasesScreen } from './test-cases-screen';
import { getTestCase, getTestCaseDashboard, listTestCases } from '../../lib/test-cases-api';
import { makeDashboard } from '../../test/test-case-dashboard-fixtures';
import { addRun, createExecution, getExecution, listExecutions } from '../../lib/executions-api';
import { listEnvironments } from '../../lib/environments-api';
import { useSessionContext } from '../../lib/session-context';
import type { ProjectRole } from '../../lib/test-case-permissions';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeExecution, makeExecutionWithRuns, makeRun } from '../../test/execution-fixtures';

const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/test-cases',
  useSearchParams: () => search,
}));
vi.mock('../../lib/session-context', () => ({ useSessionContext: vi.fn() }));
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/test-cases-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/test-cases-api')>()),
  listTestCases: vi.fn(),
  getTestCase: vi.fn(),
  updateTestCase: vi.fn(),
  deleteTestCase: vi.fn(),
  createTestCase: vi.fn(),
  getTestCaseDashboard: vi.fn(),
}));
vi.mock('../../lib/executions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/executions-api')>()),
  createExecution: vi.fn(),
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
  addRun: vi.fn(),
}));
vi.mock('../../lib/environments-api', () => ({ listEnvironments: vi.fn() }));
vi.mock('../../lib/folders-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/folders-api')>()),
  listFolders: vi.fn().mockResolvedValue([]),
}));

const ready = { id: 'tc-ready', name: 'Login works', gherkinScript: null, status: 'Ready' as const, sourceType: 'Manual' as const };
const draft = { ...ready, id: 'tc-draft', name: 'Not finished', status: 'Draft' as const };
const deprecated = { ...ready, id: 'tc-old', name: 'Obsolete', status: 'Deprecated' as const };

function asRole(role: ProjectRole) {
  vi.mocked(useSessionContext).mockReturnValue({
    data: { workspaceId: 'w1', projectId: 'p1', projectName: 'Project', role },
    loading: false,
    error: null,
  } as ReturnType<typeof useSessionContext>);
}

async function openTestCase(name: string) {
  fireEvent.click(await screen.findByText(name));
  // Tree rows don't show the source type, so "Manual" appears once the detail has loaded.
  await screen.findByText('Manual');
}


/** Radix's DropdownMenu opens on pointerdown, not click. */
function openRunMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Run' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
}
describe('Run from a test case', () => {
  beforeEach(() => {
    push.mockReset();
    search = new URLSearchParams();
    vi.mocked(listTestCases).mockResolvedValue([ready, draft, deprecated]);
    vi.mocked(getTestCase).mockImplementation(async (_client, _projectId, id) =>
      [ready, draft, deprecated].find((testCase) => testCase.id === id)!,
    );
    vi.mocked(listEnvironments).mockResolvedValue([]);
    vi.mocked(getTestCaseDashboard).mockReset().mockResolvedValue(makeDashboard());
  });

  it('a Contributor runs a Ready test case and lands on the new execution', async () => {
    asRole('Contributor');
    vi.mocked(createExecution).mockResolvedValue(makeExecution({ id: 'new-exec' }));
    renderWithProviders(<TestCasesScreen />);

    await openTestCase('Login works');
    openRunMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New execution' }));

    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Login works');
    expect(within(dialog).getByRole('list', { name: 'Selected test cases' }).textContent).toContain('Login works');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create execution' }));

    await waitFor(() =>
      expect(createExecution).toHaveBeenCalledWith(
        expect.anything(),
        'p1',
        expect.objectContaining({ name: 'Login works', testCaseIds: ['tc-ready'] }),
      ),
    );
    expect(push).toHaveBeenCalledWith('/executions?execution=new-exec');
  });

  describe('Run → Add to existing execution (ADR 0021)', () => {
    beforeEach(() => {
      vi.mocked(addRun).mockReset();
      vi.mocked(listExecutions).mockResolvedValue([
        makeExecution({ id: 'smoke', name: 'Smoke', status: 'Draft' }),
        makeExecution({ id: 'regression', name: 'Regression', status: 'Draft' }),
        makeExecution({ id: 'nightly', name: 'Nightly', status: 'Ready' }),
      ]);
      vi.mocked(getExecution).mockImplementation(async (_client, _projectId, id) =>
        makeExecutionWithRuns(id === 'regression' ? [makeRun({ testCaseId: 'tc-ready' })] : [makeRun({ testCaseId: 'tc-other' })], {
          id,
          status: 'Draft',
        }),
      );
    });

    it('lists Draft executions, disables one that already holds it, and adds to the chosen one', async () => {
      asRole('Contributor');
      vi.mocked(addRun).mockResolvedValue(makeExecution({ id: 'smoke', name: 'Smoke' }));
      renderWithProviders(<TestCasesScreen />);

      await openTestCase('Login works');
      openRunMenu();
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to existing execution…' }));
      const list = await screen.findByRole('list', { name: 'Draft executions' });

      expect(within(list).queryByText('Nightly')).toBeNull();
      await waitFor(() =>
        expect((within(list).getByRole('button', { name: /Regression/ }) as HTMLButtonElement).disabled).toBe(true),
      );
      expect(within(list).getByText('Already includes it')).toBeTruthy();
      fireEvent.click(within(list).getByRole('button', { name: /Smoke/ }));

      await waitFor(() => expect(addRun).toHaveBeenCalledWith(expect.anything(), 'p1', 'smoke', 'tc-ready'));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/executions?execution=smoke'));
    });

    it('says so when there are no Draft executions', async () => {
      asRole('Contributor');
      vi.mocked(listExecutions).mockResolvedValue([makeExecution({ id: 'nightly', status: 'Ready' })]);
      renderWithProviders(<TestCasesScreen />);

      await openTestCase('Login works');
      openRunMenu();
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to existing execution…' }));

      expect(await screen.findByText(/There are no Draft executions/)).toBeTruthy();
    });
  });

  it.each(['Not finished', 'Obsolete'])('Run is not offered for a non-Ready test case (%s)', async (name) => {
    asRole('Contributor');
    renderWithProviders(<TestCasesScreen />);

    await openTestCase(name);

    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('Run is not offered to a Viewer', async () => {
    asRole('Viewer');
    renderWithProviders(<TestCasesScreen />);

    await openTestCase('Login works');

    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('?testCase=<id> opens on that test case', async () => {
    asRole('Viewer');
    search = new URLSearchParams('testCase=tc-old');
    renderWithProviders(<TestCasesScreen />);

    await waitFor(() => expect(getTestCase).toHaveBeenCalledWith(expect.anything(), 'p1', 'tc-old'));
    // Tree row + detail both show the name once the detail has loaded.
    await screen.findByText('Manual');
    expect(screen.getAllByText('Obsolete').length).toBeGreaterThan(1);
  });
});

describe('the dashboard as the default right panel (ADR 0025)', () => {
  const folder = { id: 'f-checkout', name: 'Checkout', parentFolderId: null, positionKey: 'a0' };

  beforeEach(async () => {
    search = new URLSearchParams();
    vi.mocked(listTestCases).mockResolvedValue([ready, { ...draft, folderId: 'f-checkout' }]);
    vi.mocked(getTestCase).mockImplementation(async (_client, _projectId, id) => [ready, draft].find((t) => t.id === id)!);
    vi.mocked(getTestCaseDashboard).mockReset().mockResolvedValue(makeDashboard());
    const { listFolders } = await import('../../lib/folders-api');
    vi.mocked(listFolders).mockResolvedValue([folder] as never);
  });

  it('opens on the dashboard, with the Dashboard toggle pressed', async () => {
    asRole('Viewer');
    renderWithProviders(<TestCasesScreen />);

    expect(await screen.findByRole('region', { name: 'Total Tests' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('the toggle returns from a test case detail to the dashboard', async () => {
    asRole('Viewer');
    renderWithProviders(<TestCasesScreen />);
    await openTestCase('Login works');
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Total Tests' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(await screen.findByRole('region', { name: 'Total Tests' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('?testCase=<id> shows the detail, not the dashboard', async () => {
    asRole('Viewer');
    search = new URLSearchParams('testCase=tc-ready');
    renderWithProviders(<TestCasesScreen />);

    await screen.findByText('Manual');
    expect(screen.queryByRole('region', { name: 'Total Tests' })).toBeNull();
    expect(getTestCaseDashboard).not.toHaveBeenCalled();
  });

  it('selecting a folder still shows its summary', async () => {
    asRole('Viewer');
    renderWithProviders(<TestCasesScreen />);

    fireEvent.click(await screen.findByText('Checkout'));

    expect(await screen.findByText(/subfolder/i)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Total Tests' })).toBeNull();
  });
});
