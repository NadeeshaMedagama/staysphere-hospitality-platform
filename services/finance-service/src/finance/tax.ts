import { money, type Money, type TaxComponent } from '@staysphere/contracts';

export interface TaxableLine {
  readonly amountMinor: number;
  readonly taxable: boolean;
}

export interface ComputedTaxLine {
  readonly code: string;
  readonly label: string;
  readonly basisPoints: number;
  readonly base: Money;
  readonly amount: Money;
}

export interface TaxComputation {
  readonly taxableBase: Money;
  readonly lines: readonly ComputedTaxLine[];
  readonly totalTax: Money;
}

/**
 * Computes tax over a set of invoice lines.
 *
 * Two things matter here and both are easy to get wrong:
 *
 * 1. **Exclusive vs inclusive.** An exclusive tax is added on top of the price;
 *    an inclusive tax is already inside it and must be *extracted*
 *    (`amount × rate / (1 + rate)`), not added again. Treating an inclusive tax
 *    as exclusive overcharges every guest.
 *
 * 2. **Each component is computed on the same base**, not compounded on the
 *    previous one. VAT and city tax are parallel levies; charging city tax on
 *    top of VAT would overstate the bill.
 *
 * Rounding is applied per component, which is what tax authorities expect and
 * what makes the printed invoice add up.
 */
export function computeTax(
  lines: readonly TaxableLine[],
  components: readonly TaxComponent[],
  currency: string,
): TaxComputation {
  const taxableBaseMinor = lines
    .filter((line) => line.taxable)
    .reduce((sum, line) => sum + line.amountMinor, 0);

  const computed = components.map((component) => {
    const rate = component.basisPoints / 10_000;
    const amountMinor = component.exclusive
      ? Math.round(taxableBaseMinor * rate)
      : Math.round((taxableBaseMinor * rate) / (1 + rate));

    return {
      code: component.code,
      label: component.label,
      basisPoints: component.basisPoints,
      base: money(taxableBaseMinor, currency),
      amount: money(amountMinor, currency),
    };
  });

  return {
    taxableBase: money(taxableBaseMinor, currency),
    lines: computed,
    totalTax: money(
      computed.reduce((sum, line) => sum + line.amount.amountMinor, 0),
      currency,
    ),
  };
}

export interface InvoiceTotals {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly total: Money;
}

/**
 * Totals an invoice.
 *
 * The discount is applied before tax, so a guest is not taxed on money they did
 * not pay. Getting this order wrong is the single most common invoicing bug.
 */
export function computeInvoiceTotals(
  lines: readonly TaxableLine[],
  discountMinor: number,
  components: readonly TaxComponent[],
  currency: string,
): InvoiceTotals & { taxLines: readonly ComputedTaxLine[] } {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const cappedDiscount = Math.min(Math.max(0, discountMinor), subtotalMinor);

  // Spread the discount proportionally so the taxable share shrinks with it.
  const discountRatio = subtotalMinor === 0 ? 0 : cappedDiscount / subtotalMinor;
  const discountedLines = lines.map((line) => ({
    ...line,
    amountMinor: Math.round(line.amountMinor * (1 - discountRatio)),
  }));

  const tax = computeTax(discountedLines, components, currency);
  const netMinor = subtotalMinor - cappedDiscount;

  return {
    subtotal: money(subtotalMinor, currency),
    discount: money(cappedDiscount, currency),
    tax: tax.totalTax,
    total: money(netMinor + tax.totalTax.amountMinor, currency),
    taxLines: tax.lines,
  };
}
