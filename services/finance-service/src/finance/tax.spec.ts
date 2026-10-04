import { DEFAULT_TAX_COMPONENTS, type TaxComponent } from '@staysphere/contracts';
import { computeInvoiceTotals, computeTax, type TaxableLine } from './tax';

const line = (amountMinor: number, taxable = true): TaxableLine => ({ amountMinor, taxable });

const vatOnly: TaxComponent[] = [
  { code: 'VAT', label: 'Value Added Tax', basisPoints: 1200, exclusive: true },
];

describe('computeTax', () => {
  it('adds an exclusive tax on top of the base', () => {
    const result = computeTax([line(10_000)], vatOnly, 'USD');
    expect(result.taxableBase.amountMinor).toBe(10_000);
    expect(result.totalTax.amountMinor).toBe(1_200);
  });

  it('extracts an inclusive tax from within the price', () => {
    // 11,200 inclusive of 12% VAT contains 1,200 of tax, not 1,344.
    const inclusive: TaxComponent[] = [
      { code: 'VAT', label: 'VAT', basisPoints: 1200, exclusive: false },
    ];
    expect(computeTax([line(11_200)], inclusive, 'USD').totalTax.amountMinor).toBe(1_200);
  });

  it('excludes non-taxable lines from the base', () => {
    const result = computeTax([line(10_000), line(5_000, false)], vatOnly, 'USD');
    expect(result.taxableBase.amountMinor).toBe(10_000);
    expect(result.totalTax.amountMinor).toBe(1_200);
  });

  it('computes each component on the same base rather than compounding', () => {
    // City tax must not be charged on top of VAT.
    const result = computeTax([line(10_000)], DEFAULT_TAX_COMPONENTS, 'USD');
    const vat = result.lines.find((l) => l.code === 'VAT');
    const city = result.lines.find((l) => l.code === 'CITY');
    expect(vat?.amount.amountMinor).toBe(1_200);
    expect(city?.amount.amountMinor).toBe(50);
    expect(city?.base.amountMinor).toBe(10_000);
    expect(result.totalTax.amountMinor).toBe(1_250);
  });

  it('rounds each component to whole minor units', () => {
    const result = computeTax([line(3_333)], vatOnly, 'USD');
    expect(Number.isInteger(result.totalTax.amountMinor)).toBe(true);
    expect(result.totalTax.amountMinor).toBe(400);
  });

  it('returns zero tax for an empty or fully exempt invoice', () => {
    expect(computeTax([], vatOnly, 'USD').totalTax.amountMinor).toBe(0);
    expect(computeTax([line(10_000, false)], vatOnly, 'USD').totalTax.amountMinor).toBe(0);
  });
});

describe('computeInvoiceTotals', () => {
  it('totals a simple invoice', () => {
    const totals = computeInvoiceTotals([line(30_000), line(5_000)], 0, vatOnly, 'USD');
    expect(totals.subtotal.amountMinor).toBe(35_000);
    expect(totals.tax.amountMinor).toBe(4_200);
    expect(totals.total.amountMinor).toBe(39_200);
  });

  it('applies the discount before tax, so the guest is not taxed on it', () => {
    const totals = computeInvoiceTotals([line(30_000)], 3_000, vatOnly, 'USD');
    expect(totals.discount.amountMinor).toBe(3_000);
    // Tax is 12% of 27,000, not of 30,000.
    expect(totals.tax.amountMinor).toBe(3_240);
    expect(totals.total.amountMinor).toBe(30_240);
  });

  it('spreads the discount proportionally across taxable and exempt lines', () => {
    const totals = computeInvoiceTotals(
      [line(20_000), line(20_000, false)],
      10_000,
      vatOnly,
      'USD',
    );
    // Half the discount lands on the taxable line: tax is 12% of 15,000.
    expect(totals.tax.amountMinor).toBe(1_800);
  });

  it('caps the discount at the subtotal so the total never goes negative', () => {
    const totals = computeInvoiceTotals([line(10_000)], 50_000, vatOnly, 'USD');
    expect(totals.discount.amountMinor).toBe(10_000);
    expect(totals.total.amountMinor).toBe(0);
  });

  it('ignores a negative discount', () => {
    const totals = computeInvoiceTotals([line(10_000)], -5_000, vatOnly, 'USD');
    expect(totals.discount.amountMinor).toBe(0);
    expect(totals.total.amountMinor).toBe(11_200);
  });

  it('handles an empty invoice without dividing by zero', () => {
    const totals = computeInvoiceTotals([], 0, vatOnly, 'USD');
    expect(totals.total.amountMinor).toBe(0);
  });

  it('keeps every amount an integer in the invoice currency', () => {
    const totals = computeInvoiceTotals(
      [line(12_345), line(6_789)],
      1_111,
      DEFAULT_TAX_COMPONENTS,
      'LKR',
    );
    for (const amount of [totals.subtotal, totals.discount, totals.tax, totals.total]) {
      expect(Number.isInteger(amount.amountMinor)).toBe(true);
      expect(amount.currency).toBe('LKR');
    }
  });
});
