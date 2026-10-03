import { describe, expect, it } from 'vitest';
import { DEBIT_LINE_KINDS, FolioLineKind } from './stay.js';

describe('folio line classification', () => {
  it('treats room, service, tax and adjustment as charges', () => {
    expect([...DEBIT_LINE_KINDS].sort()).toEqual(
      [
        FolioLineKind.ADJUSTMENT,
        FolioLineKind.ROOM,
        FolioLineKind.SERVICE,
        FolioLineKind.TAX,
      ].sort(),
    );
  });

  it('never counts a payment, refund or discount as a charge', () => {
    for (const kind of [FolioLineKind.PAYMENT, FolioLineKind.REFUND, FolioLineKind.DISCOUNT]) {
      expect(DEBIT_LINE_KINDS).not.toContain(kind);
    }
  });
});
