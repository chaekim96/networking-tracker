import { describe, it, expect } from 'vitest';
import { validateContact, isPriority, PRIORITIES, NAME_MAX } from '@/lib/validation';

/**
 * These cover the server-side validation that the API route handlers run on
 * every write. They are deliberately written against untrusted-looking input
 * (the shapes a hand-crafted curl request would send), not against what the
 * UI happens to produce.
 */

const valid = {
  name: 'Dana Whitfield',
  company: 'Haas',
  role: 'Lecturer',
  met_at: 'Networking night',
  notes: 'Follow up in two weeks',
  priority: 'high',
};

describe('name validation', () => {
  it('accepts a valid contact and returns normalised values', () => {
    const result = validateContact(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Dana Whitfield');
      expect(result.value.priority).toBe('high');
    }
  });

  it('rejects an empty name with a clear message', () => {
    const result = validateContact({ ...valid, name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.fieldErrors.name).toBe('Name is required.');
      expect(result.error.message).toBe('Name is required.');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = validateContact({ ...valid, name: '   \t \n ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors.name).toBe('Name is required.');
  });

  it('rejects a missing name', () => {
    const { name, ...withoutName } = valid;
    const result = validateContact(withoutName);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-string name', () => {
    for (const name of [42, true, null, {}, ['a']]) {
      expect(validateContact({ ...valid, name }).ok).toBe(false);
    }
  });

  it('rejects a name over the length cap', () => {
    const result = validateContact({ ...valid, name: 'a'.repeat(NAME_MAX + 1) });
    expect(result.ok).toBe(false);
  });

  it('trims surrounding whitespace from an otherwise valid name', () => {
    const result = validateContact({ ...valid, name: '  Dana  ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Dana');
  });
});

describe('priority validation', () => {
  it.each(PRIORITIES)('accepts the allowed value %s', (priority) => {
    expect(validateContact({ ...valid, priority }).ok).toBe(true);
  });

  it('rejects a value outside the allowed set', () => {
    const result = validateContact({ ...valid, priority: 'urgent' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.fieldErrors.priority).toBe(
        'Priority must be one of: high, medium, low.'
      );
    }
  });

  it('rejects values that differ only by case', () => {
    expect(validateContact({ ...valid, priority: 'High' }).ok).toBe(false);
    expect(validateContact({ ...valid, priority: 'HIGH' }).ok).toBe(false);
  });

  it('rejects a missing priority', () => {
    const { priority, ...withoutPriority } = valid;
    const result = validateContact(withoutPriority);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors.priority).toBe('Priority is required.');
  });

  it('rejects non-string priorities', () => {
    for (const priority of [1, true, {}, ['high']]) {
      expect(validateContact({ ...valid, priority }).ok).toBe(false);
    }
  });

  it('isPriority guards the allowed set', () => {
    expect(isPriority('low')).toBe(true);
    expect(isPriority('urgent')).toBe(false);
    expect(isPriority(undefined)).toBe(false);
  });
});

describe('optional fields', () => {
  it('normalises blank optional fields to null', () => {
    const result = validateContact({ name: 'Dana', priority: 'low', company: '   ', notes: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.company).toBeNull();
      expect(result.value.notes).toBeNull();
      expect(result.value.role).toBeNull();
      expect(result.value.met_at).toBeNull();
    }
  });

  it('reports several problems at once', () => {
    const result = validateContact({ name: '', priority: 'urgent' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.error.fieldErrors).sort()).toEqual(['name', 'priority']);
      expect(result.error.message).toBe('Please fix 2 fields before saving.');
    }
  });
});

describe('ownership cannot be smuggled in', () => {
  it('drops user_id and id from the payload instead of passing them through', () => {
    const result = validateContact({
      ...valid,
      user_id: 'some-other-users-id',
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty('user_id');
      expect(result.value).not.toHaveProperty('id');
    }
  });

  it('rejects non-object payloads', () => {
    for (const payload of [null, undefined, 'name=Dana', 42, ['Dana']]) {
      expect(validateContact(payload).ok).toBe(false);
    }
  });
});
