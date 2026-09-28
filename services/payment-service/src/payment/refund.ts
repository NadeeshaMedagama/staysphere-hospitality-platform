import { DomainError, ErrorCode, PaymentStatus, money, type Money } from '@staysphere/contracts';
import { REFUNDABLE_STATUSES } from './payment-state.js';

export interface RefundablePayment {
  readonly id: string;
  readonly status: PaymentStatus;
  readonly capturedMinor: number;
  readonly refundedMinor: number;
  readonly currency: string;
}

export interface RefundOutcome {
  readonly amount: Money;
  /** Total refunded across every refund once this one is applied. */
  readonly totalRefundedMinor: number;
  readonly remainingRefundableMinor: number;
  readonly nextStatus: PaymentStatus;
  readonly partial: boolean;
}

/** What is still returnable on a payment. */
export function refundableAmount(payment: RefundablePayment): Money {
  if (!REFUNDABLE_STATUSES.includes(payment.status)) {
    return money(0, payment.currency);
  }
  return money(Math.max(0, payment.capturedMinor - payment.refundedMinor), payment.currency);
}

/**
 * Validates a refund and works out the payment's resulting state.
 *
 * The cap is `captured − alreadyRefunded`, not `captured`: without subtracting
 * prior refunds, two sequential half-refunds would each pass and the hotel would
 * return 150% of what it took. This is the single most important check in the
 * service.
 */
export function assessRefund(payment: RefundablePayment, requested: Money): RefundOutcome {
  if (requested.currency !== payment.currency) {
    throw new DomainError(
      ErrorCode.CURRENCY_MISMATCH,
      `The refund is in ${requested.currency} but the payment was taken in ${payment.currency}.`,
      { details: { paymentCurrency: payment.currency, refundCurrency: requested.currency } },
    );
  }

  if (requested.amountMinor <= 0) {
    throw DomainError.validation('A refund must be for a positive amount.', {
      requested: requested.amountMinor,
    });
  }

  if (!REFUNDABLE_STATUSES.includes(payment.status)) {
    throw new DomainError(
      ErrorCode.CONFLICT,
      `A payment in status ${payment.status} cannot be refunded.`,
      { details: { status: payment.status } },
    );
  }

  const available = refundableAmount(payment);
  if (requested.amountMinor > available.amountMinor) {
    throw new DomainError(
      ErrorCode.REFUND_EXCEEDS_CAPTURE,
      'The refund exceeds the amount still available on this payment.',
      {
        details: {
          requestedMinor: requested.amountMinor,
          availableMinor: available.amountMinor,
          capturedMinor: payment.capturedMinor,
          alreadyRefundedMinor: payment.refundedMinor,
        },
      },
    );
  }

  const totalRefundedMinor = payment.refundedMinor + requested.amountMinor;
  const fullyRefunded = totalRefundedMinor >= payment.capturedMinor;

  return {
    amount: requested,
    totalRefundedMinor,
    remainingRefundableMinor: payment.capturedMinor - totalRefundedMinor,
    nextStatus: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
    partial: !fullyRefunded,
  };
}
