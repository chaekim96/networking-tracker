'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/session-provider';
import { Skeleton } from '@/components/ui/skeleton';

/** Entry point: send signed-in users to their list, everyone else to sign-in. */
export default function Home() {
  const { user, loading } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    router.replace(user ? '/contacts' : '/auth/sign-in');
  }, [user, loading, router]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
