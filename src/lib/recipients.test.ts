/**
 * Unit tests for the one-record-per-person merge in
 * `upsertRecipientByChannel` — the "email Jeff today, text him later"
 * rule — plus `channelsOf`, the pairwise `mergeTwoRecords` union and
 * its `applyMergeTwo` commit, and `channelSummary`. The merge logic
 * lives in `recipient-merge.ts` (pure: no react-native import, so
 * Vitest can run it); only the `queries` module is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    deleteRecipient,
    fetchRecipients,
    saveRecipient,
    type RecipientRow,
} from '@/lib/db/queries';
import {
    RecipientChannel,
    applyMergeTwo,
    channelSummary,
    channelsOf,
    mergeTwoRecords,
    upsertRecipientByChannel,
} from './recipient-merge';

vi.mock('@/lib/db/queries', () => ({
  fetchRecipients: vi.fn(),
  saveRecipient: vi.fn(),
  deleteRecipient: vi.fn(),
}));

/** Build a row with defaults. */
function row(overrides: Partial<RecipientRow>): RecipientRow {
  return {
    id: 'r1',
    label: 'Jeff',
    email: null,
    email2: null,
    phone: null,
    lastUsedAt: 0,
    ...overrides,
  };
}

/** The fake db handle — `withTransactionAsync` just runs its callback
 * (the mocked queries it calls are what the assertions look at). */
const fakeDb = {
  withTransactionAsync: async (work: () => Promise<void>) => {
    await work();
  },
} as never;

/** Deterministic id factory for assertions. */
const genId = (() => {
  let n = 0;
  return () => `new-${++n}`;
})();

describe('upsertRecipientByChannel', () => {
  beforeEach(() => {
    vi.mocked(fetchRecipients).mockReset();
    vi.mocked(saveRecipient).mockReset();
    vi.mocked(deleteRecipient).mockReset();
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

describe('mergeTwoRecords', () => {
  it('unions both records: unset fields on the kept record are filled from the dropped one', () => {
    const kept = row({ id: 'keep', label: 'Jeff', email: 'jeff@example.com', phone: null, lastUsedAt: 100 });
    const dropped = row({ id: 'drop', label: 'Jeff Smith', email: null, phone: '555-0100', lastUsedAt: 50 });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.merged.id).toBe('keep');
    expect(result.merged.email).toBe('jeff@example.com');
    expect(result.merged.phone).toBe('555-0100');
    expect(result.merged.lastUsedAt).toBe(100);
    expect(result.droppedId).toBe('drop');
    expect(result.conflicts).toEqual([]);
  });

  it('keeps both distinct emails — the home + work case — instead of a conflict', () => {
    const kept = row({ id: 'keep', label: 'Jeff', email: 'jeff@home.example' });
    const dropped = row({ id: 'drop', label: 'Jefferson', email: 'js@example.com' });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.merged.email).toBe('jeff@home.example');
    expect(result.merged.email2).toBe('js@example.com');
    expect(result.conflicts).toEqual([]);
  });

  it('conflicts on a third distinct email that does not fit either slot', () => {
    const kept = row({
      id: 'keep',
      label: 'Jeff',
      email: 'jeff@home.example',
      email2: 'jsmith@work.example',
    });
    const dropped = row({ id: 'drop', label: 'Jefferson', email: 'jeff93@example.com' });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.merged.email).toBe('jeff@home.example');
    expect(result.merged.email2).toBe('jsmith@work.example');
    expect(result.conflicts).toEqual([
      { field: 'email2', kept: 'jsmith@work.example', dropped: 'jeff93@example.com' },
    ]);
  });

  it('treats digit-equivalent phones as no conflict', () => {
    const kept = row({ id: 'keep', label: 'Jeff', phone: '(555) 010-0000' });
    const dropped = row({ id: 'drop', label: 'Jefferson', phone: '5550100000' });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.conflicts).toEqual([]);
    // The kept record's formatting wins on equivalence.
    expect(result.merged.phone).toBe('(555) 010-0000');
  });

  it('reports a conflict when phones differ beyond formatting', () => {
    const kept = row({ id: 'keep', label: 'Jeff', phone: '555-0100' });
    const dropped = row({ id: 'drop', label: 'Jefferson', phone: '555-9999' });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.conflicts).toEqual([
      { field: 'phone', kept: '555-0100', dropped: '555-9999' },
    ]);
  });

  it('does not error when both records are empty of channels', () => {
    const kept = row({ id: 'keep', label: 'Jeff' });
    const dropped = row({ id: 'drop', label: 'Jefferson' });

    const result = mergeTwoRecords(kept, dropped);

    expect(result.merged.email).toBeNull();
    expect(result.merged.phone).toBeNull();
    expect(result.conflicts).toEqual([]);
  });
});

describe('applyMergeTwo', () => {
  it('persists the merged row and deletes the dropped record', async () => {
    vi.mocked(saveRecipient).mockReset();
    const kept = row({ id: 'keep', label: 'Jeff', email: 'jeff@example.com' });
    const dropped = row({ id: 'drop', label: 'Jefferson', phone: '555-0100' });
    const result = mergeTwoRecords(kept, dropped);

    await applyMergeTwo(fakeDb, result);

    expect(deleteRecipient).toHaveBeenCalledWith(fakeDb, 'drop');
    expect(saveRecipient).toHaveBeenCalledWith(fakeDb, result.merged);
  });
});

describe('channelSummary', () => {
  it('joins only set values', () => {
    expect(channelSummary(row({ email: 'a@b.c', phone: '555' }))).toBe('a@b.c · 555');
    expect(channelSummary(row({ email: 'a@b.c' }))).toBe('a@b.c');
    expect(channelSummary(row({}))).toBe('');
  });
});
