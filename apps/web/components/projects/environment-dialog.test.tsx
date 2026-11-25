import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { BASE_URL_MESSAGE, DUPLICATE_ALIAS_MESSAGE, EnvironmentDialog, UNCHANGED_PLACEHOLDER } from './environment-dialog';
import { createEnvironment, revealCredential, updateEnvironment, type Environment } from '../../lib/environments-api';
import { staging } from '../../test/environment-fixtures';
import { ApiError } from '../../lib/api-client';
import { renderWithProviders } from '../../test/render-with-providers';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/environments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/environments-api')>()),
  createEnvironment: vi.fn(),
  updateEnvironment: vi.fn(),
  revealCredential: vi.fn(),
}));
vi.mock('../../lib/notify', () => ({ notifySuccess: vi.fn() }));

/** Opens the editor as the section does, and lets a test close and reopen it. */
function Harness({ environment }: { environment: Environment | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <EnvironmentDialog projectId="p1" environment={environment} open={open} onOpenChange={setOpen} />
    </>
  );
}

const dialog = () => screen.getByRole('dialog');
const type = (label: string, value: string, within_: HTMLElement = dialog()) =>
  fireEvent.change(within(within_).getByLabelText(label), { target: { value } });
const credential = (n: number) => within(dialog()).getByRole('group', { name: `Credential ${n}` });
const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

function fillEnvironment(name = 'Staging', baseUrl = 'https://staging.shop.test') {
  type('Name', name);
  type('Base URL', baseUrl);
}

function addCredential(n: number, alias: string, email: string, password: string) {
  fireEvent.click(within(dialog()).getByRole('button', { name: /Add credential/ }));
  type('Alias', alias, credential(n));
  type('Email', email, credential(n));
  type('Password', password, credential(n));
}

describe('EnvironmentDialog: adding (specs/project-settings-screen)', () => {
  beforeEach(() => {
    vi.mocked(createEnvironment).mockReset().mockResolvedValue({ id: 'new', name: 'Staging', baseUrl: '', defaultBrowser: 'Firefox', credentials: [] });
  });

  it('creates an environment with a credential and closes', async () => {
    renderWithProviders(<Harness environment={null} />);
    expect(within(dialog()).getByText('Add environment')).toBeTruthy();
    fillEnvironment();
    fireEvent.click(within(dialog()).getByLabelText('Default browser'));
    fireEvent.click(await screen.findByRole('option', { name: 'Firefox' }));
    addCredential(1, 'admin', 'admin@shop.test', 's3cret');
    save();

    await waitFor(() =>
      expect(createEnvironment).toHaveBeenCalledWith(expect.anything(), 'p1', {
        name: 'Staging',
        baseUrl: 'https://staging.shop.test',
        defaultBrowser: 'Firefox',
        credentials: [{ alias: 'admin', email: 'admin@shop.test', password: 's3cret' }],
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('creates an environment without credentials, Chromium by default', async () => {
    renderWithProviders(<Harness environment={null} />);
    expect(within(dialog()).getByText('No credentials. Add one if testers need to sign in.')).toBeTruthy();
    fillEnvironment();
    save();
    await waitFor(() =>
      expect(createEnvironment).toHaveBeenCalledWith(expect.anything(), 'p1', {
        name: 'Staging',
        baseUrl: 'https://staging.shop.test',
        defaultBrowser: 'Chromium',
        credentials: [],
      }),
    );
  });

  it('refuses a base URL without http:// or https://', async () => {
    renderWithProviders(<Harness environment={null} />);
    fillEnvironment('Staging', 'staging.shop.test');
    save();
    expect(await within(dialog()).findByText(BASE_URL_MESSAGE)).toBeTruthy();
    expect(createEnvironment).not.toHaveBeenCalled();
  });

  it('marks a repeated alias and sends nothing', async () => {
    renderWithProviders(<Harness environment={null} />);
    fillEnvironment();
    addCredential(1, 'admin', 'admin@shop.test', 'a');
    addCredential(2, 'admin', 'other@shop.test', 'b');
    save();
    await waitFor(() => expect(within(dialog()).getAllByText(DUPLICATE_ALIAS_MESSAGE)).toHaveLength(2));
    expect(createEnvironment).not.toHaveBeenCalled();
  });

  it('marks a malformed email and a missing password', async () => {
    renderWithProviders(<Harness environment={null} />);
    fillEnvironment();
    addCredential(1, 'admin', 'not-an-email', '');
    save();
    expect(await within(credential(1)).findByText('Enter a valid email')).toBeTruthy();
    expect(within(credential(1)).getByText('Password is required')).toBeTruthy();
    expect(createEnvironment).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps what was entered", async () => {
    vi.mocked(createEnvironment).mockRejectedValue(new ApiError(400, 'name must be a non-empty string', '/projects/p1/environments'));
    renderWithProviders(<Harness environment={null} />);
    fillEnvironment();
    save();
    expect(await within(dialog()).findByText('name must be a non-empty string')).toBeTruthy();
    expect((within(dialog()).getByLabelText('Name') as HTMLInputElement).value).toBe('Staging');
  });
});

describe('EnvironmentDialog: editing (specs/project-settings-screen)', () => {
  beforeEach(() => {
    vi.mocked(updateEnvironment).mockReset().mockResolvedValue(staging);
  });

  it('opens filled in, with stored passwords masked and empty', () => {
    renderWithProviders(<Harness environment={staging} />);
    expect(within(dialog()).getByText('Edit “Staging”')).toBeTruthy();
    expect((within(dialog()).getByLabelText('Name') as HTMLInputElement).value).toBe('Staging');
    expect((within(dialog()).getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://staging.shop.test');
    expect(within(dialog()).getByLabelText('Default browser').textContent).toContain('Firefox');
    const password = within(credential(1)).getByLabelText('Password') as HTMLInputElement;
    expect((within(credential(1)).getByLabelText('Alias') as HTMLInputElement).value).toBe('admin');
    expect(password.type).toBe('password');
    expect(password.value).toBe('');
    expect(password.placeholder).toBe(UNCHANGED_PLACEHOLDER);
  });

  it('keeps every stored password when only the base URL changes', async () => {
    renderWithProviders(<Harness environment={staging} />);
    type('Base URL', 'https://staging2.shop.test');
    save();
    await waitFor(() =>
      expect(updateEnvironment).toHaveBeenCalledWith(expect.anything(), 'p1', 'env-staging', {
        name: 'Staging',
        baseUrl: 'https://staging2.shop.test',
        defaultBrowser: 'Firefox',
        credentials: [
          { id: 'cred-admin', alias: 'admin', email: 'admin@shop.test' },
          { id: 'cred-buyer', alias: 'buyer', email: 'buyer@shop.test' },
        ],
      }),
    );
  });

  it('sends a replaced password and leaves a removed credential out', async () => {
    renderWithProviders(<Harness environment={staging} />);
    type('Password', 'n3w', credential(1));
    fireEvent.click(within(credential(2)).getByRole('button', { name: 'Remove buyer' }));
    save();
    await waitFor(() =>
      expect(updateEnvironment).toHaveBeenCalledWith(expect.anything(), 'p1', 'env-staging', {
        name: 'Staging',
        baseUrl: 'https://staging.shop.test',
        defaultBrowser: 'Firefox',
        credentials: [{ id: 'cred-admin', alias: 'admin', email: 'admin@shop.test', password: 'n3w' }],
      }),
    );
  });

  it('requires a password for a new row but not for a stored one', async () => {
    renderWithProviders(<Harness environment={staging} />);
    addCredential(3, 'ops', 'ops@shop.test', '');
    save();
    expect(await within(credential(3)).findByText('Password is required')).toBeTruthy();
    expect(within(credential(1)).queryByText('Password is required')).toBeNull();
    expect(updateEnvironment).not.toHaveBeenCalled();
  });
});

describe('EnvironmentDialog: revealing (specs/project-settings-screen)', () => {
  beforeEach(() => {
    vi.mocked(revealCredential).mockReset().mockResolvedValue({ password: 'hunter2' });
  });

  it('reveals a stored password next to its credential', async () => {
    renderWithProviders(<Harness environment={staging} />);
    expect(within(credential(1)).getByRole('button', { name: 'Reveal password' })).toBeTruthy();
    fireEvent.click(within(credential(1)).getByRole('button', { name: 'Reveal password' }));
    expect((await within(credential(1)).findByLabelText('Password for admin')).textContent).toBe('hunter2');
    expect(revealCredential).toHaveBeenCalledWith(expect.anything(), 'p1', 'env-staging', 'cred-admin');
  });

  it('offers no reveal on a credential that is not stored yet', () => {
    renderWithProviders(<Harness environment={staging} />);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Add credential/ }));
    expect(within(credential(3)).queryByRole('button', { name: 'Reveal password' })).toBeNull();
  });

  it('forgets the password when the dialog closes', async () => {
    const { queryClient } = renderWithProviders(<Harness environment={staging} />);
    fireEvent.click(within(credential(1)).getByRole('button', { name: 'Reveal password' }));
    await within(credential(1)).findByLabelText('Password for admin');
    // Nothing in the query cache holds it.
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('hunter2');

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(within(credential(1)).queryByLabelText('Password for admin')).toBeNull();
    expect(within(credential(1)).getByRole('button', { name: 'Reveal password' })).toBeTruthy();
    expect(screen.queryByText('hunter2')).toBeNull();
    expect(revealCredential).toHaveBeenCalledTimes(1);
  });

  it('says when reveals are rate-limited', async () => {
    vi.mocked(revealCredential).mockRejectedValue(new ApiError(429, 'Too Many Requests', '/reveal'));
    renderWithProviders(<Harness environment={staging} />);
    fireEvent.click(within(credential(1)).getByRole('button', { name: 'Reveal password' }));
    expect(await within(dialog()).findByText(/too many|try again/i)).toBeTruthy();
  });
});
