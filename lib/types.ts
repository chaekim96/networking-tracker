import type { Priority, ContactFields } from '@/lib/validation';

/** A contacts row as it comes back from the Data API. */
export type Contact = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  met_at: string | null;
  notes: string | null;
  priority: Priority;
  created_at: string;
};

/**
 * Schema shape for the PostgREST client's generics.
 *
 * Insert deliberately has no `user_id`: the column defaults to auth.user_id()
 * in Postgres, so the type system also refuses to let us send one.
 */
export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: Contact;
        Insert: ContactFields;
        Update: Partial<ContactFields>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type ApiError = {
  message: string;
  fieldErrors?: Record<string, string>;
};
