/**
 * Unit tests for the one-record-per-person merge in
 * `upsertRecipientByChannel` — the "email Jeff today, text him later"
 * rule — plus `channelsOf`. The merge lives in `recipient-merge.ts`
 * (pure: no react-native import, so Vitest can run it); only
 * `fetchRecipients`/`saveRecipient` are mocked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { fetchRecipients, saveRecipient, type RecipientRow } from '@/lib/db/queries';
import {
  RecipientChannel,
  channelsOf,
  upsertRecipientByChannel,
} from './recipient-merge';

vi.mock('@/lib/db/queries', () => ({
  fetchRecipients: vi.fn(),
  saveRecipient: vi.fn(),
}));

/** Build a row with defaults. */
function row(overrides: Partial<RecipientRow>): RecipientRow {
  return {
    id: 'r1',
    label: 'Jeff',
    email: null,
    phone: null,
    lastUsedAt: 0,
    ...overrides,
  };
}

/** The fake db handle — sending it anywhere is fine; only the mocked
 * module's functions are called. */
const fakeDb = {} as never;

/** Deterministic id factory for assertions. */
const genId = (() => {
  let n = 0;
  return () => `new-${++n}`;
})();

describe('upsertRecipientByChannel', () => {
  beforeEach(() => {
    vi.mocked(fetchRecipients).mockReset();
    vi.mocked(saveRecipient).mockReset();
  });

  it('reuses the record when the exact email already exists', async () => {
    const jeff = row({ email: 'jsmith@dynics.com' });
    vi.mocked(fetchRecipients).mockResolvedValue([jeff]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'Jeff Smith',
      'jsmith@dynics.com',
      RecipientChannel.Email,
      genId,
    );

    expect(result.id).toBe('r1');
    expect(saveRecipient).not.toHaveBeenCalled();
  });

  it('reuses the record when the exact phone already exists', async () => {
    const jeff = row({ phone: '555-0100' });
    vi.mocked(fetchRecipients).mockResolvedValue([jeff]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'Jeff',
      '555-0100',
      RecipientChannel.Text,
      genId,
    );

    expect(result.id).toBe('r1');
    expect(saveRecipient).not.toHaveBeenCalled();
  });

  it('fills the empty phone field on the same-label record instead of creating a duplicate', async () => {
    // The core case: emailed him earlier, now texting.
    const jeff = row({ email: 'jsmith@dynics.com', phone: null });
    vi.mocked(fetchRecipients).mockResolvedValue([jeff]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'Jeff',
      '555-0100',
      RecipientChannel.Text,
      genId,
    );

    expect(result.id).toBe('r1');
    expect(result.email).toBe('jsmith@dynics.com');
    expect(result.phone).toBe('555-0100');
    expect(saveRecipient).toHaveBeenCalledWith(fakeDb, result);
  });

  it('does not overwrite an existing phone when the record already has one — creates a new record instead', async () => {
    // Same label, but the record's phone is already set to something
    // else: this is a different person sharing a name, not a merge.
    const jeff = row({ email: 'jsmith@dynics.com', phone: '555-9999' });
    vi.mocked(fetchRecipients).mockResolvedValue([jeff]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'Jeff',
      '555-0100',
      RecipientChannel.Text,
      genId,
    );

    expect(result.id).not.toBe('r1');
    expect(result.phone).toBe('555-0100');
    expect(result.email).toBeNull();
    expect(saveRecipient).toHaveBeenCalledWith(fakeDb, result);
  });

  it('creates a new record when nothing matches', async () => {
    vi.mocked(fetchRecipients).mockResolvedValue([]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'Accountant',
      'tax@firm.example',
      RecipientChannel.Email,
      genId,
    );

    expect(result.label).toBe('Accountant');
    expect(result.email).toBe('tax@firm.example');
    expect(result.phone).toBeNull();
  });

  it('matches labels case-insensitively', async () => {
    const jeff = row({ email: 'jsmith@dynics.com' });
    vi.mocked(fetchRecipients).mockResolvedValue([jeff]);

    const result = await upsertRecipientByChannel(
      fakeDb,
      'jeff',
      '555-0100',
      RecipientChannel.Text,
      genId,
    );

    expect(result.id).toBe('r1');
    expect(result.phone).toBe('555-0100');
  });

  it('rejects an empty label or value', async () => {
    await expect(
      upsertRecipientByChannel(fakeDb, '', 'x@y.z', RecipientChannel.Email, genId),
    ).rejects.toThrow(/both required/);
    await expect(
      upsertRecipientByChannel(fakeDb, 'Jeff', '  ', RecipientChannel.Text, genId),
    ).rejects.toThrow(/both required/);
  });
});

describe('channelsOf', () => {
  it('lists only the channels a record has values for', () => {
    expect(channelsOf(row({ email: 'a@b.c', phone: '555' }))).toEqual([
      RecipientChannel.Email,
      RecipientChannel.Text,
    ]);
    expect(channelsOf(row({ email: 'a@b.c' }))).toEqual([RecipientChannel.Email]);
    expect(channelsOf(row({ phone: '555' }))).toEqual([RecipientChannel.Text]);
  });
});
