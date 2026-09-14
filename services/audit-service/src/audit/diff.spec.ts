import { REDACTED, describeChange, diffRecords, isRedactedField } from './diff';

describe('diffRecords', () => {
  it('records only the fields that changed', () => {
    const changes = diffRecords(
      { name: 'Deluxe King', priceMinor: 10_000, floor: 3 },
      { name: 'Deluxe King', priceMinor: 12_500, floor: 3 },
    );
    expect(changes).toEqual([{ field: 'priceMinor', before: 10_000, after: 12_500 }]);
  });

  it('returns nothing when nothing changed', () => {
    expect(diffRecords({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('records a field that was added or removed', () => {
    expect(diffRecords({ a: 1 }, { a: 1, b: 2 })).toEqual([{ field: 'b', before: null, after: 2 }]);
    expect(diffRecords({ a: 1, b: 2 }, { a: 1 })).toEqual([{ field: 'b', before: 2, after: null }]);
  });

  it('ignores bookkeeping columns by default', () => {
    expect(
      diffRecords(
        { name: 'A', updatedAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01') },
        { name: 'A', updatedAt: new Date('2026-09-09'), createdAt: new Date('2026-01-01') },
      ),
    ).toEqual([]);
  });

  it('honours an additional ignore list', () => {
    expect(
      diffRecords({ a: 1, lastSeenAt: 1 }, { a: 1, lastSeenAt: 2 }, { ignore: ['lastSeenAt'] }),
    ).toEqual([]);
  });

  it('redacts a sensitive value but still records that it changed', () => {
    // The log must show a password was changed, never what it changed to.
    const changes = diffRecords(
      { email: 'a@example.com', passwordHash: '$argon2id$old' },
      { email: 'a@example.com', passwordHash: '$argon2id$new' },
    );
    expect(changes).toEqual([{ field: 'passwordHash', before: REDACTED, after: REDACTED }]);
    expect(JSON.stringify(changes)).not.toContain('argon2id');
  });

  it('redacts a sensitive field nested inside an object', () => {
    const changes = diffRecords(
      { user: { refreshToken: 'old-token' } },
      { user: { refreshToken: 'new-token' } },
    );
    expect(changes[0]?.field).toBe('user.refreshToken');
    expect(changes[0]?.after).toBe(REDACTED);
    expect(JSON.stringify(changes)).not.toContain('token-');
  });

  it('descends into nested objects and reports a dotted path', () => {
    const changes = diffRecords(
      { policy: { checkInFrom: '14:00', petsAllowed: false } },
      { policy: { checkInFrom: '15:00', petsAllowed: false } },
    );
    expect(changes).toEqual([{ field: 'policy.checkInFrom', before: '14:00', after: '15:00' }]);
  });

  it('stops descending at the depth limit and compares wholesale', () => {
    const changes = diffRecords(
      { a: { b: { c: { d: 1 } } } },
      { a: { b: { c: { d: 2 } } } },
      { maxDepth: 2 },
    );
    expect(changes[0]?.field).toBe('a.b.c');
  });

  it('compares arrays and dates by value', () => {
    expect(diffRecords({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
    expect(diffRecords({ tags: ['a'] }, { tags: ['a', 'b'] })).toHaveLength(1);
    expect(
      diffRecords({ at: new Date('2026-01-01') }, { at: new Date('2026-01-01') }, { ignore: [] }),
    ).toEqual([]);
  });

  it('serialises dates as ISO strings', () => {
    const changes = diffRecords({ at: new Date('2026-01-01') }, { at: new Date('2026-09-09') });
    expect(changes[0]?.after).toBe('2026-09-09T00:00:00.000Z');
  });

  it('handles a creation and a deletion', () => {
    expect(diffRecords(null, { name: 'New' })).toEqual([
      { field: 'name', before: null, after: 'New' },
    ]);
    expect(diffRecords({ name: 'Old' }, null)).toEqual([
      { field: 'name', before: 'Old', after: null },
    ]);
  });

  it('sorts changes by field so entries read consistently', () => {
    const changes = diffRecords({ z: 1, a: 1, m: 1 }, { z: 2, a: 2, m: 2 });
    expect(changes.map((c) => c.field)).toEqual(['a', 'm', 'z']);
  });
});

describe('isRedactedField', () => {
  it('matches regardless of case, separators or compounding', () => {
    for (const field of ['password', 'passwordHash', 'password_hash', 'user.refreshToken', 'CVV']) {
      expect({ field, redacted: isRedactedField(field) }).toEqual({ field, redacted: true });
    }
  });

  it('does not over-match ordinary fields', () => {
    for (const field of ['email', 'roomNumber', 'status', 'name']) {
      expect({ field, redacted: isRedactedField(field) }).toEqual({ field, redacted: false });
    }
  });
});

describe('describeChange', () => {
  it('renders the way an audit reader expects', () => {
    expect(describeChange({ field: 'priceMinor', before: 10_000, after: 12_500 })).toBe(
      'priceMinor: 10000 → 12500',
    );
  });

  it('renders an absent value readably', () => {
    expect(describeChange({ field: 'note', before: null, after: 'Added' })).toBe(
      'note: (none) → Added',
    );
  });
});
