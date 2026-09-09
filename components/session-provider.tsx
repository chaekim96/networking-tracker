'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { neon } from '@/lib/auth/client';

type SessionUser = { id: string; email: string; name?: string | null };

type SessionState = {
  user: SessionUser | null;
  /** True only during the first resolve, so pages can show a real loading state. */
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = React.createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  const refresh = React.useCallback(async () => {
    try {
      const { data } = await neon.auth.getSession();
      setUser((data?.user as SessionUser | undefined) ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    await neon.auth.signOut();
    setUser(null);
    router.push('/auth/sign-in');
  }, [router]);

  const value = React.useMemo(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
