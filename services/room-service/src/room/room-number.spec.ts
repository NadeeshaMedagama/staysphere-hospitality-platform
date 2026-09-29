import { compareRoomNumbers, deriveFloor, generateRoomNumbers } from './room-number';

describe('deriveFloor', () => {
  it('reads the floor from a three-digit room number', () => {
    expect(deriveFloor('101')).toBe(1);
    expect(deriveFloor('905')).toBe(9);
  });

  it('reads the floor from a four-digit room number', () => {
    expect(deriveFloor('1204')).toBe(12);
  });

  it('reads a basement level', () => {
    expect(deriveFloor('B101')).toBe(-1);
    expect(deriveFloor('b201')).toBe(-2);
  });

  it('returns null rather than guessing an ambiguous number', () => {
    // Guessing wrong sends housekeeping to the wrong floor.
    expect(deriveFloor('12')).toBeNull();
    expect(deriveFloor('PENTHOUSE')).toBeNull();
    expect(deriveFloor('12A')).toBeNull();
  });
});

describe('generateRoomNumbers', () => {
  it('generates a floor of zero-padded numbers', () => {
    expect(generateRoomNumbers({ floor: 1, count: 4 })).toEqual(['101', '102', '103', '104']);
  });

  it('handles a double-digit floor', () => {
    expect(generateRoomNumbers({ floor: 12, count: 2 })).toEqual(['1201', '1202']);
  });

  it('honours a starting sequence number', () => {
    expect(generateRoomNumbers({ floor: 2, count: 3, startAt: 10 })).toEqual(['210', '211', '212']);
  });

  it('prefixes a basement floor', () => {
    expect(generateRoomNumbers({ floor: -1, count: 2 })).toEqual(['B101', 'B102']);
  });

  it('rejects a floor that would overflow the two-digit sequence', () => {
    expect(() => generateRoomNumbers({ floor: 1, count: 5, startAt: 96 })).toThrow(/01–99/);
  });

  it('rejects an empty or oversized floor', () => {
    expect(() => generateRoomNumbers({ floor: 1, count: 0 })).toThrow();
    expect(() => generateRoomNumbers({ floor: 1, count: 120 })).toThrow();
  });

  it('rejects floor zero, which hotels do not use', () => {
    expect(() => generateRoomNumbers({ floor: 0, count: 4 })).toThrow();
  });

  it('round-trips through deriveFloor', () => {
    for (const floor of [1, 3, 12, -1]) {
      for (const number of generateRoomNumbers({ floor, count: 3 })) {
        expect(deriveFloor(number)).toBe(floor);
      }
    }
  });
});

describe('compareRoomNumbers', () => {
  it('orders by floor, then numerically within the floor', () => {
    const sorted = ['205', '101', '1002', '110', 'B101'].sort(compareRoomNumbers);
    expect(sorted).toEqual(['B101', '101', '110', '205', '1002']);
  });

  it('pushes unparseable numbers to the end rather than mis-sorting them', () => {
    const sorted = ['PENTHOUSE', '101'].sort(compareRoomNumbers);
    expect(sorted[0]).toBe('101');
  });
});
