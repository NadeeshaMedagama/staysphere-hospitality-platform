import { multiplyMoney, money, type Money } from '@staysphere/contracts';

export interface CancellationTier {
  /** Applies when cancelling at least this many hours before check-in. */
  readonly hoursBeforeCheckIn: number;
  /** Fraction of the paid amount returned, 0–1. */
  readonly refundRatio: number;
  readonly label: string;
}

export interface CancellationPolicy {
  readonly code: string;
  readonly tiers: readonly CancellationTier[];
  /** Non-refundable regardless of notice, in minor units. */
  readonly nonRefundableFeeMinor: number;
}

/**
 * Default policy. Tiers are evaluated most-generous-first, so the guest always
 * receives the best band their notice period qualifies for.
 */
export const STANDARD_CANCELLATION_POLICY: CancellationPolicy = {
  code: 'STANDARD_7_3',
  nonRefundableFeeMinor: 0,
  tiers: [
    { hoursBeforeCheckIn: 168, refundRatio: 1, label: 'Free cancellation (7+ days notice)' },
    { hoursBeforeCheckIn: 72, refundRatio: 0.5, label: 'Partial refund (3–7 days notice)' },
    { hoursBeforeCheckIn: 0, refundRatio: 0, label: 'Non-refundable (under 3 days notice)' },
  ],
};

export interface RefundAssessment {
  readonly refund: Money;
  readonly retained: Money;
  readonly tier: CancellationTier;
  readonly hoursNotice: number;
}

/**
 * Works out what a guest gets back.
 *
 * Notice is measured to check-in, so cancelling a stay that has already started
 * yields negative notice and lands in the least generous tier — which is the
 * correct commercial outcome, not an error.
 */
export function assessRefund(
  amountPaid: Money,
  checkIn: Date,
  cancelledAt: Date,
  policy: CancellationPolicy = STANDARD_CANCELLATION_POLICY,
): RefundAssessment {
  const hoursNotice = (checkIn.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);

  const tier =
    [...policy.tiers]
      .sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn)
      .find((candidate) => hoursNotice >= candidate.hoursBeforeCheckIn) ??
    ({ hoursBeforeCheckIn: 0, refundRatio: 0, label: 'Non-refundable' } as CancellationTier);

  const gross = multiplyMoney(amountPaid, tier.refundRatio);
  const fee = Math.min(policy.nonRefundableFeeMinor, gross.amountMinor);
  const refund = money(Math.max(0, gross.amountMinor - fee), amountPaid.currency);
  const retained = money(amountPaid.amountMinor - refund.amountMinor, amountPaid.currency);

  return { refund, retained, tier, hoursNotice: Math.floor(hoursNotice) };
}
