import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { SessionProvider } from '../../lib/session-context';
import { SessionLiveUpdates } from '../../lib/live-updates';
import { Shell } from '../../components/shell';

/**
 * Reads the sidebar's remembered state server-side so it renders collapsed or expanded
 * from the first paint (no flash). This makes the (app) routes render on demand, which
 * they effectively do anyway: every one needs a signed-in session.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <SessionProvider>
      <SessionLiveUpdates>
        <Shell defaultOpen={defaultOpen}>{children}</Shell>
      </SessionLiveUpdates>
    </SessionProvider>
  );
}
