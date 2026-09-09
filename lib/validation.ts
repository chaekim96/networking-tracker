/**
 * Contact validation.
 *
 * Pure functions, zero dependencies, no I/O — which is what makes them cheap
 * to unit-test and safe to run in both the browser (for instant feedback) and
 * the server route handlers (where the result is actually trusted).
 *
 * The browser copy is a convenience. THIS module running on the server, plus
 * the CHECK constraints in db/schema.sql, are the two layers that count.
 */

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const NAME_MAX = 120;
export const SHORT_TEXT_MAX = 160;
export const NOTES_MAX = 2000;

/** A row as the client is permitted to specify it. Note: no id, no user_id. */
export type ContactFields = {
  name: string;
  company: string | null;
  role: string | null;
  met_at: string | null;
  notes: string | null;
  priority: Priority;
};

export type ValidationError = {
  /** Field-keyed messages, for rendering inline under the offending input. */
  fieldErrors: Record<string, string>;
  /** One summary line safe to show the user directly. */
  message: string;
};

export type ValidationResult =
  | { ok: true; value: ContactFields }
  | { ok: false; error: ValidationError };

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/** Trim a value to a clean string, or null when it carries no information. */
function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validate and normalise an untrusted payload into a row we are willing to
 * write. Returns cleaned values rather than the raw input, so callers cannot
 * accidentally forward unvalidated data.
 *
 * Fields are ALLOW-LISTED. Anything else in the payload — notably `user_id`
 * or `id` — is dropped rather than passed through, so a hand-crafted request
 * cannot smuggle an ownership column into the insert. (The RLS policies would
 * reject it anyway; this just means it never gets that far.)
 */
export function validateContact(input: unknown): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      error: {
        fieldErrors: {},
        message: 'Expected a contact object.',
      },
    };
  }

  const raw = input as Record<string, unknown>;

  // --- name: the only genuinely required field ---
  const rawName = raw.name;
  let name = '';
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    fieldErrors.name = 'Name is required.';
  } else if (rawName.trim().length > NAME_MAX) {
    fieldErrors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  } else {
    name = rawName.trim();
  }

  // --- priority: restricted vocabulary ---
  // Absent is a distinct error from present-but-wrong; the messages differ so
  // the user knows whether they forgot it or chose something invalid.
  const rawPriority = raw.priority;
  let priority: Priority = 'medium';
  if (rawPriority === undefined || rawPriority === null || rawPriority === '') {
    fieldErrors.priority = 'Priority is required.';
  } else if (!isPriority(rawPriority)) {
    fieldErrors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}.`;
  } else {
    priority = rawPriority;
  }

  // --- optional text fields: length-capped so a client cannot post a novel ---
  const company = optionalText(raw.company);
  const role = optionalText(raw.role);
  const met_at = optionalText(raw.met_at);
  const notes = optionalText(raw.notes);

  if (company && company.length > SHORT_TEXT_MAX)
    fieldErrors.company = `Company must be ${SHORT_TEXT_MAX} characters or fewer.`;
  if (role && role.length > SHORT_TEXT_MAX)
    fieldErrors.role = `Role must be ${SHORT_TEXT_MAX} characters or fewer.`;
  if (met_at && met_at.length > SHORT_TEXT_MAX)
    fieldErrors.met_at = `Where you met must be ${SHORT_TEXT_MAX} characters or fewer.`;
  if (notes && notes.length > NOTES_MAX)
    fieldErrors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;

  const failed = Object.keys(fieldErrors);
  if (failed.length > 0) {
    return {
      ok: false,
      error: {
        fieldErrors,
        // Single field -> show its specific message. Several -> summarise,
        // and the inline field errors carry the detail.
        message:
          failed.length === 1
            ? fieldErrors[failed[0]]
            : `Please fix ${failed.length} fields before saving.`,
      },
    };
  }

  return { ok: true, value: { name, company, role, met_at, notes, priority } };
}
