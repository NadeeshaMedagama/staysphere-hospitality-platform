import { ErrorCode, PaymentStatus } from '@staysphere/contracts';
import {
  PAYMENT_TRANSITIONS,
  assertPaymentTransition,
  canTransitionPayment,
  isSettled,
} from './payment-state';

describe('payment state machine', () => {
  it('follows authorise-then-capture', () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.AUTHORIZED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.AUTHORIZED, PaymentStatus.COMPLETED)).toBe(true);
  });

  it('allows an immediate capture without a separate hold', () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.COMPLETED)).toBe(true);
  });

  it('never revives a failed payment', () => {
    // A new attempt is a new payment, not a resurrection of the old one.
    expect(PAYMENT_TRANSITIONS[PaymentStatus.FAILED]).toHaveLength(0);
    expect(canTransitionPayment(PaymentStatus.FAILED, PaymentStatus.COMPLETED)).toBe(false);
  });

  it('never refunds money that was only authorised', () => {
    expect(canTransitionPayment(PaymentStatus.AUTHORIZED, PaymentStatus.REFUNDED)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.REFUNDED)).toBe(false);
  });

  it('moves from partial to full refund but never back', () => {
    expect(canTransitionPayment(PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)).toBe(
      true,
    );
    expect(canTransitionPayment(PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED)).toBe(
      false,
    );
  });

  it('treats a fully refunded payment as terminal', () => {
    expect(PAYMENT_TRANSITIONS[PaymentStatus.REFUNDED]).toHaveLength(0);
  });

  it('throws with the permitted set when a transition is rejected', () => {
    expect(() => assertPaymentTransition(PaymentStatus.FAILED, PaymentStatus.COMPLETED)).toThrow(
      expect.objectContaining({ code: ErrorCode.CONFLICT }),
    );
  });

  it('defines transitions for every status', () => {
    for (const status of Object.values(PaymentStatus)) {
      expect(PAYMENT_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('isSettled', () => {
  it('counts captured and refunded payments as settled', () => {
    expect(isSettled(PaymentStatus.COMPLETED)).toBe(true);
    expect(isSettled(PaymentStatus.PARTIALLY_REFUNDED)).toBe(true);
    expect(isSettled(PaymentStatus.REFUNDED)).toBe(true);
  });

  it('does not count a hold or a failure as settled', () => {
    expect(isSettled(PaymentStatus.AUTHORIZED)).toBe(false);
    expect(isSettled(PaymentStatus.PENDING)).toBe(false);
    expect(isSettled(PaymentStatus.FAILED)).toBe(false);
  });
});
