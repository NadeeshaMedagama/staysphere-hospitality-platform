import { DomainError, ErrorCode, PaymentStatus } from '@staysphere/contracts';

/**
 * Payment lifecycle.
 *
 * AUTHORIZED is a hold, not money moved: a hotel authorises at booking and
 * captures at check-in, so a no-show can be released without a refund. Both
 * refund states are terminal — a further refund updates the amounts, not the
 * status, and REFUNDED is reached only when the whole capture is returned.
 */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.AUTHORIZED]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
  [PaymentStatus.COMPLETED]: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new DomainError(ErrorCode.CONFLICT, `A payment cannot move from ${from} to ${to}.`, {
      details: { from, to, allowed: PAYMENT_TRANSITIONS[from] },
    });
  }
}

/** Statuses in which money has actually been taken and could be returned. */
export const REFUNDABLE_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.COMPLETED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

export function isSettled(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.COMPLETED ||
    status === PaymentStatus.PARTIALLY_REFUNDED ||
    status === PaymentStatus.REFUNDED
  );
}
