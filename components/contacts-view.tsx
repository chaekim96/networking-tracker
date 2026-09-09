'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { neon } from '@/lib/auth/client';
import type { Contact } from '@/lib/types';
import { PRIORITIES, type Priority } from '@/lib/validation';
import { ContactCard } from '@/components/contact-card';
import { ContactFormDialog } from '@/components/contact-form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'priority';
type Status = 'loading' | 'ready' | 'error';

const sortLabels: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  'name-asc': 'Name A–Z',
  'name-desc': 'Name Z–A',
  priority: 'Priority',
};

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function ContactsView() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [status, setStatus] = React.useState<Status>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState('');
  const [priority, setPriority] = React.useState<Priority | 'all'>('all');
  const [sort, setSort] = React.useState<SortKey>('newest');

  /**
   * Reads go straight from the browser to the Neon Data API. There is no
   * "where user_id = me" here and there must not be: the SELECT policy applies
   * that filter inside Postgres. If this query is ever wrong, the worst case
   * is that a user sees fewer of their own rows — never someone else's.
   */
  const load = React.useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const { data, error: dbError } = await neon
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbError) throw new Error(dbError.message);

      setContacts((data ?? []) as Contact[]);
      setStatus('ready');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load your contacts.'
      );
      setStatus('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();

    const filtered = contacts.filter((c) => {
      if (priority !== 'all' && c.priority !== priority) return false;
      if (!needle) return true;
      return [c.name, c.company, c.role, c.met_at, c.notes]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.created_at.localeCompare(b.created_at);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'priority':
          return (
            priorityRank[a.priority] - priorityRank[b.priority] ||
            a.name.localeCompare(b.name)
          );
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    return sorted;
  }, [contacts, search, priority, sort]);

  const filtersActive = search.trim().length > 0 || priority !== 'all';

  function onCreated(contact: Contact) {
    setContacts((prev) => [contact, ...prev]);
    toast.success(`Added ${contact.name}.`);
  }

  function onUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
    toast.success(`Updated ${contact.name}.`);
  }

  function onDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm">
            {status === 'ready'
              ? `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'} in your network`
              : 'Your private networking list'}
          </p>
        </div>

        <ContactFormDialog
          onSaved={onCreated}
          trigger={<Button>Add contact</Button>}
        />
      </div>

      {/* Controls stack on mobile, sit inline from sm up. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="search" className="sr-only">
            Search contacts
          </Label>
          <Input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, role, notes…"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 sm:w-40 sm:flex-none">
            <Label htmlFor="filter-priority" className="sr-only">
              Filter by priority
            </Label>
            <Select
              value={priority}
              onValueChange={(v) => v && setPriority(v as Priority | 'all')}
            >
              <SelectTrigger id="filter-priority" className="w-full">
                {/* Base UI renders the raw value unless given a formatter. */}
                <SelectValue>
                  {(v: string | null) =>
                    v === 'all' || v === null ? 'All priorities' : priorityLabels[v as Priority]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {priorityLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 sm:w-44 sm:flex-none">
            <Label htmlFor="sort" className="sr-only">
              Sort contacts
            </Label>
            <Select value={sort} onValueChange={(v) => v && setSort(v as SortKey)}>
              <SelectTrigger id="sort" className="w-full">
                <SelectValue>
                  {(v: string | null) => (v ? sortLabels[v as SortKey] : '')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {sortLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* --- LOADING --- */}
      {status === 'loading' && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your contacts…</span>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* --- ERROR --- */}
      {status === 'error' && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load your contacts</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* --- EMPTY (nothing saved yet) --- */}
      {status === 'ready' && contacts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <h2 className="font-semibold">No contacts yet</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Add the first person you want to stay connected with. Only you can
              see what you save here.
            </p>
            <ContactFormDialog
              onSaved={onCreated}
              trigger={<Button>Add your first contact</Button>}
            />
          </CardContent>
        </Card>
      )}

      {/* --- EMPTY (filters exclude everything) --- */}
      {status === 'ready' && contacts.length > 0 && visible.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <h2 className="font-semibold">No matches</h2>
            <p className="text-muted-foreground text-sm">
              No contacts match your search and filters.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setPriority('all');
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* --- SUCCESS --- */}
      {status === 'ready' && visible.length > 0 && (
        <>
          {filtersActive && (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              Showing {visible.length} of {contacts.length}
            </p>
          )}
          <ul className="space-y-3">
            {visible.map((contact) => (
              <li key={contact.id}>
                <ContactCard
                  contact={contact}
                  onUpdated={onUpdated}
                  onDeleted={onDeleted}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
