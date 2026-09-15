import { FolioLineKind, money } from '@staysphere/contracts';
import { buildFolioLine, computeFolioBalance, type FolioLine } from './folio';

const line = (kind: FolioLineKind, amountMinor: number): FolioLine => ({
  kind,
  amountMinor,
  currency: 'USD',
});

describe('computeFolioBalance', () => {
  it('reports a zero balance for an empty folio', () => {
    const balance = computeFolioBalance([], 'USD');
    expect(balance.balanceDue.amountMinor).toBe(0);
    expect(balance.settled).toBe(true);
  });

  it('sums room, service and tax as charges', () => {
    const balance = computeFolioBalance(
      [
        line(FolioLineKind.ROOM, 30_000),
        line(FolioLineKind.SERVICE, 5_000),
        line(FolioLineKind.SERVICE, 3_500),
        line(FolioLineKind.TAX, 3_850),
      ],
      'USD',
    );
    expect(balance.charges.amountMinor).toBe(42_350);
    expect(balance.balanceDue.amountMinor).toBe(42_350);
    expect(balance.settled).toBe(false);
  });

  it('subtracts a discount from the charges', () => {
    const balance = computeFolioBalance(
      [line(FolioLineKind.ROOM, 30_000), line(FolioLineKind.DISCOUNT, 2_000)],
      'USD',
    );
    expect(balance.discounts.amountMinor).toBe(2_000);
    expect(balance.balanceDue.amountMinor).toBe(28_000);
  });

  it('treats a discount stored as a negative amount identically', () => {
    const positive = computeFolioBalance([line(FolioLineKind.DISCOUNT, 2_000)], 'USD');
    const negative = computeFolioBalance([line(FolioLineKind.DISCOUNT, -2_000)], 'USD');
    expect(positive.discounts).toEqual(negative.discounts);
  });

  it('settles the folio once payment covers the charges', () => {
    const balance = computeFolioBalance(
      [line(FolioLineKind.ROOM, 30_000), line(FolioLineKind.PAYMENT, 30_000)],
      'USD',
    );
    expect(balance.balanceDue.amountMinor).toBe(0);
    expect(balance.settled).toBe(true);
  });

  it('reopens the balance when money is refunded', () => {
    const balance = computeFolioBalance(
      [
        line(FolioLineKind.ROOM, 30_000),
        line(FolioLineKind.PAYMENT, 30_000),
        line(FolioLineKind.REFUND, 10_000),
      ],
      'USD',
    );
    expect(balance.balanceDue.amountMinor).toBe(10_000);
    expect(balance.settled).toBe(false);
  });

  it('reports a credit balance when the guest has overpaid', () => {
    const balance = computeFolioBalance(
      [line(FolioLineKind.ROOM, 30_000), line(FolioLineKind.PAYMENT, 35_000)],
      'USD',
    );
    expect(balance.balanceDue.amountMinor).toBe(-5_000);
    expect(balance.settled).toBe(true);
  });

  it('applies a correction as an adjustment line', () => {
    const balance = computeFolioBalance(
      [line(FolioLineKind.ROOM, 30_000), line(FolioLineKind.ADJUSTMENT, 1_500)],
      'USD',
    );
    expect(balance.charges.amountMinor).toBe(31_500);
  });

  it('refuses to mix currencies on one folio', () => {
    expect(() =>
      computeFolioBalance(
        [
          line(FolioLineKind.ROOM, 30_000),
          { kind: FolioLineKind.SERVICE, amountMinor: 100, currency: 'EUR' },
        ],
        'USD',
      ),
    ).toThrow(/cannot be summed/);
  });

  it('reproduces the worked example from the specification', () => {
    // Room 300 + breakfast 50 + room service 35 + tax 38.50 − discount 20 = 403.50
    const balance = computeFolioBalance(
      [
        line(FolioLineKind.ROOM, 30_000),
        line(FolioLineKind.SERVICE, 5_000),
        line(FolioLineKind.SERVICE, 3_500),
        line(FolioLineKind.TAX, 3_850),
        line(FolioLineKind.DISCOUNT, 2_000),
      ],
      'USD',
    );
    expect(balance.balanceDue.amountMinor).toBe(40_350);
  });
});

describe('buildFolioLine', () => {
  it('multiplies the unit price by the quantity', () => {
    const built = buildFolioLine({
      kind: FolioLineKind.SERVICE,
      description: 'Breakfast',
      quantity: 3,
      unitPrice: money(2_500, 'USD'),
    });
    expect(built.amountMinor).toBe(7_500);
    expect(built.unitPriceMinor).toBe(2_500);
    expect(built.currency).toBe('USD');
  });
});
