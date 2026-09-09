'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/session-provider';
import { SiteHeader } from '@/components/site-header';
import { ContactsView } from '@/components/contacts-view';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Redirecting unauthenticated visitors here is a convenience, not the security
 * boundary. Someone who skips this page entirely and calls the Data API directly
 * still gets nothing back: RLS decides what they can read, not this component.
 */
export default function ContactsPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !user) router.replace('/auth/sign-in');
  }, [user, loading, router]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {loading || !user ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
          <ContactsView />
        )}
      </main>
    </>
  );
}
