'use client';

import * as React from 'react';
import { authedFetch } from '@/lib/auth/client';
import { validateContact, PRIORITIES, type Priority } from '@/lib/validation';
import type { Contact } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  contact?: Contact;
  onSaved: (contact: Contact) => void;
  /** Base UI replaces Radix's `asChild` with a `render` prop, which takes an element. */
  trigger: React.ReactElement;
};

const empty = {
  name: '',
  company: '',
  role: '',
  met_at: '',
  notes: '',
  priority: 'medium' as Priority,
};

export function ContactFormDialog({ contact, onSaved, trigger }: Props) {
  const isEdit = Boolean(contact);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(empty);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Reset to the contact's current values each time the dialog opens, so a
  // cancelled edit never leaks into the next one.
  React.useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setFormError(null);
    setForm(
      contact
        ? {
            name: contact.name,
            company: contact.company ?? '',
            role: contact.role ?? '',
            met_at: contact.met_at ?? '',
            notes: contact.notes ?? '',
            priority: contact.priority,
          }
        : empty
    );
  }, [open, contact]);

  const set = (key: keyof typeof empty) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Same validator the server runs — here purely so the user gets an answer
    // without a round trip. The server's verdict is the one that counts.
    const local = validateContact(form);
    if (!local.ok) {
      setFieldErrors(local.error.fieldErrors);
      setFormError(local.error.message);
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      const response = await authedFetch(
        isEdit ? `/api/contacts/${contact!.id}` : '/api/contacts',
        { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(local.value) }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(body.fieldErrors ?? {});
        setFormError(body.message ?? 'Could not save this contact.');
        return;
      }

      onSaved(body.contact as Contact);
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add a contact'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update what you know about this person.'
              : 'Only a name and a priority are required.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="name" label="Name" required error={fieldErrors.name}>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              placeholder="Dana Whitfield"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="company" label="Company" error={fieldErrors.company}>
              <Input
                id="company"
                value={form.company}
                onChange={(e) => set('company')(e.target.value)}
                placeholder="Haas"
              />
            </Field>

            <Field id="role" label="Role" error={fieldErrors.role}>
              <Input
                id="role"
                value={form.role}
                onChange={(e) => set('role')(e.target.value)}
                placeholder="Lecturer"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="met_at" label="Where you met" error={fieldErrors.met_at}>
              <Input
                id="met_at"
                value={form.met_at}
                onChange={(e) => set('met_at')(e.target.value)}
                placeholder="Orientation mixer"
              />
            </Field>

            <Field id="priority" label="Priority" required error={fieldErrors.priority}>
              <Select
                value={form.priority}
                onValueChange={(v) => v && set('priority')(v)}
              >
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field id="notes" label="Notes" error={fieldErrors.notes}>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="What you talked about, what to follow up on…"
            />
          </Field>

          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
