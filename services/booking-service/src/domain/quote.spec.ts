import { quoteStay, resolveLongStayDiscount, type RatePlan } from './quote';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const plan: RatePlan = {
  roomTypeId: 'deluxe',
  currency: 'USD',
  baseRateMinor: 12_000, // $120.00
  weekendMultiplier: 1.2,
  seasonalRates: [
    { label: 'Christmas', from: d('2026-12-20'), to: d('2026-12-27'), nightlyRateMinor: 19_000 },
  ],
  taxBasisPoints: 1250, // 12.5%
  longStayDiscounts: [
    { minNights: 7, percentOff: 0.1 },
    { minNights: 14, percentOff: 0.2 },
  ],
};

describe('quoteStay', () => {
  it('prices consecutive weeknights at the base rate', () => {
    // Mon 5th -> Thu 8th Oct 2026 = 3 weeknights.
    const quote = quoteStay(plan, { checkIn: d('2026-10-05'), checkOut: d('2026-10-08') });
    expect(quote.nights).toBe(3);
    expect(quote.subtotal.amountMinor).toBe(36_000);
    expect(quote.nightly.every((n) => n.kind === 'BASE')).toBe(true);
  });

  it('applies the weekend multiplier to Friday and Saturday only', () => {
    // Fri 2nd -> Mon 5th Oct 2026: Fri, Sat (weekend) + Sun (base).
    const quote = quoteStay(plan, { checkIn: d('2026-10-02'), checkOut: d('2026-10-05') });
    expect(quote.nightly.map((n) => n.kind)).toEqual(['WEEKEND', 'WEEKEND', 'BASE']);
    expect(quote.subtotal.amountMinor).toBe(14_400 + 14_400 + 12_000);
  });

  it('lets a seasonal rate override the weekend multiplier', () => {
    // 25th Dec 2026 is a Friday and inside the Christmas window.
    const quote = quoteStay(plan, { checkIn: d('2026-12-25'), checkOut: d('2026-12-26') });
    expect(quote.nightly[0]).toMatchObject({ kind: 'SEASONAL', label: 'Christmas' });
    expect(quote.subtotal.amountMinor).toBe(19_000);
  });

  it('prices a stay that straddles a season boundary correctly', () => {
    // 27th Dec is the last seasonal night; 28th falls back to base.
    const quote = quoteStay(plan, { checkIn: d('2026-12-27'), checkOut: d('2026-12-29') });
    expect(quote.nightly.map((n) => n.kind)).toEqual(['SEASONAL', 'BASE']);
    expect(quote.subtotal.amountMinor).toBe(19_000 + 12_000);
  });

  it('adds tax on the discounted amount, not the gross', () => {
    const quote = quoteStay(
      plan,
      { checkIn: d('2026-10-05'), checkOut: d('2026-10-08') },
      {
        promotionPercentOff: 0.1,
      },
    );
    expect(quote.subtotal.amountMinor).toBe(36_000);
    expect(quote.discount.amountMinor).toBe(3_600);
    expect(quote.taxable.amountMinor).toBe(32_400);
    expect(quote.tax.amountMinor).toBe(4_050);
    expect(quote.total.amountMinor).toBe(36_450);
  });

  it('stacks a long-stay tier with a promotion', () => {
    // 7 nights from Mon 5th Oct: 10% long-stay + 5% promo = 15%.
    const quote = quoteStay(
      plan,
      { checkIn: d('2026-10-05'), checkOut: d('2026-10-12') },
      {
        promotionPercentOff: 0.05,
      },
    );
    const expectedDiscount = Math.round(quote.subtotal.amountMinor * 0.15);
    expect(quote.discount.amountMinor).toBe(expectedDiscount);
  });

  it('caps stacked discounts at 90% so a folio can never go negative', () => {
    const quote = quoteStay(
      plan,
      { checkIn: d('2026-10-05'), checkOut: d('2026-10-19') },
      {
        promotionPercentOff: 0.95,
      },
    );
    expect(quote.discount.amountMinor).toBe(Math.round(quote.subtotal.amountMinor * 0.9));
    expect(quote.total.amountMinor).toBeGreaterThan(0);
  });

  it('keeps every amount in whole minor units', () => {
    const quote = quoteStay(plan, { checkIn: d('2026-10-02'), checkOut: d('2026-10-09') });
    for (const amount of [quote.subtotal, quote.discount, quote.tax, quote.total]) {
      expect(Number.isInteger(amount.amountMinor)).toBe(true);
    }
  });

  it('returns a zero quote for a zero-night range', () => {
    const quote = quoteStay(plan, { checkIn: d('2026-10-05'), checkOut: d('2026-10-05') });
    expect(quote.nights).toBe(0);
    expect(quote.total.amountMinor).toBe(0);
  });
});

describe('resolveLongStayDiscount', () => {
  const tiers = [
    { minNights: 7, percentOff: 0.1 },
    { minNights: 14, percentOff: 0.2 },
  ];

  it('returns nothing below the first threshold', () => {
    expect(resolveLongStayDiscount(tiers, 6)).toBe(0);
  });

  it('applies the tier exactly at its threshold', () => {
    expect(resolveLongStayDiscount(tiers, 7)).toBe(0.1);
  });

  it('picks the most generous qualifying tier regardless of declaration order', () => {
    expect(resolveLongStayDiscount(tiers, 21)).toBe(0.2);
  });
});
