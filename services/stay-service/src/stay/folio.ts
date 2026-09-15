import { DEBIT_LINE_KINDS, FolioLineKind, money, type Money } from '@staysphere/contracts';

export interface FolioLine {
  readonly kind: FolioLineKind;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface FolioBalance {
  /** Everything the guest has been charged: room, services, tax, adjustments. */
  readonly charges: Money;
  /** Discounts applied against those charges. */
  readonly discounts: Money;
  /** Money received. */
  readonly payments: Money;
  /** Money returned. */
  readonly refunds: Money;
  /** Positive when the guest owes, negative when the hotel owes them. */
  readonly balanceDue: Money;
  readonly settled: boolean;
}

/**
 * Computes a folio balance from its lines.
 *
 * The folio is append-only, so this is a pure fold over every line ever posted.
 * That is what makes the bill auditable: the balance is always derivable from
 * the lines, and a correction is a visible ADJUSTMENT rather than a silent edit.
 *
 * `balanceDue = (charges − discounts) − (payments − refunds)`
 */
export function computeFolioBalance(lines: readonly FolioLine[], currency: string): FolioBalance {
  let chargesMinor = 0;
  let discountsMinor = 0;
  let paymentsMinor = 0;
  let refundsMinor = 0;

  for (const line of lines) {
    if (line.currency !== currency) {
      throw new TypeError(
        `Folio line in ${line.currency} cannot be summed into a ${currency} folio.`,
      );
    }
    if (DEBIT_LINE_KINDS.includes(line.kind)) {
      chargesMinor += line.amountMinor;
    } else if (line.kind === FolioLineKind.DISCOUNT) {
      discountsMinor += Math.abs(line.amountMinor);
    } else if (line.kind === FolioLineKind.PAYMENT) {
      paymentsMinor += line.amountMinor;
    } else if (line.kind === FolioLineKind.REFUND) {
      refundsMinor += line.amountMinor;
    }
  }

  const netCharges = chargesMinor - discountsMinor;
  const netPaid = paymentsMinor - refundsMinor;
  const balanceDueMinor = netCharges - netPaid;

  return {
    charges: money(chargesMinor, currency),
    discounts: money(discountsMinor, currency),
    payments: money(paymentsMinor, currency),
    refunds: money(refundsMinor, currency),
    balanceDue: money(balanceDueMinor, currency),
    settled: balanceDueMinor <= 0,
  };
}

/** Builds a line, deriving the total from quantity and unit price. */
export function buildFolioLine(input: {
  kind: FolioLineKind;
  description: string;
  quantity: number;
  unitPrice: Money;
}): FolioLine & { description: string; quantity: number; unitPriceMinor: number } {
  return {
    kind: input.kind,
    description: input.description,
    quantity: input.quantity,
    unitPriceMinor: input.unitPrice.amountMinor,
    amountMinor: input.unitPrice.amountMinor * input.quantity,
    currency: input.unitPrice.currency,
  };
}
