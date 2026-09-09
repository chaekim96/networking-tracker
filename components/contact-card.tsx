'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/auth/client';
import type { Contact } from '@/lib/types';
import type { Priority } from '@/lib/validation';
import { ContactFormDialog } from '@/components/contact-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const priorityStyles: Record<Priority, string> = {
  high: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  medium:
    'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export function ContactCard({
  contact,
  onUpdated,
  onDeleted,
}: {
  contact: Contact;
  onUpdated: (c: Contact) => void;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      const response = await authedFetch(`/api/contacts/${contact.id}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(body.message ?? 'Could not delete this contact.');
        return;
      }

      onDeleted(contact.id);
      setConfirming(false);
      toast.success(`Deleted ${contact.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setDeleting(false);
    }
  }

  const details = [contact.role, contact.company].filter(Boolean).join(' · ');

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{contact.name}</h3>
            <Badge className={`capitalize ${priorityStyles[contact.priority]}`}>
              {contact.priority}
            </Badge>
          </div>

          {details && <p className="text-muted-foreground text-sm">{details}</p>}

          {contact.met_at && (
            <p className="text-muted-foreground text-sm">Met at {contact.met_at}</p>
          )}

          {contact.notes && (
            <p className="mt-2 text-sm whitespace-pre-wrap">{contact.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <ContactFormDialog
            contact={contact}
            onSaved={onUpdated}
            trigger={
              <Button variant="outline" size="sm">
                Edit
              </Button>
            }
          />
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {contact.name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
