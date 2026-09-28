import { ErrorCode, PaymentStatus, money } from '@staysphere/contracts';
import { assessRefund, refundableAmount, type RefundablePayment } from './refund';

const payment = (overrides: Partial<RefundablePayment> = {}): RefundablePayment => ({
  id: 'pay_1',
  status: PaymentStatus.COMPLETED,
  capturedMinor: 40_000,
  refundedMinor: 0,
  currency: 'USD',
  ...overrides,
});

describe('refundableAmount', () => {
  it('is the full capture when nothing has been returned', () => {
    expect(refundableAmount(payment()).amountMinor).toBe(40_000);
  });

  it('subtracts what has already been refunded', () => {
    expect(
      refundableAmount(payment({ refundedMinor: 15_000, status: PaymentStatus.PARTIALLY_REFUNDED }))
        .amountMinor,
    ).toBe(25_000);
  });

  it('is zero for a payment that was never captured', () => {
    expect(refundableAmount(payment({ status: PaymentStatus.AUTHORIZED })).amountMinor).toBe(0);
    expect(refundableAmount(payment({ status: PaymentStatus.FAILED })).amountMinor).toBe(0);
  });
});

describe('assessRefund', () => {
  it('accepts a partial refund and reports the remainder', () => {
    const outcome = assessRefund(payment(), money(15_000, 'USD'));
    expect(outcome.nextStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(outcome.totalRefundedMinor).toBe(15_000);
    expect(outcome.remainingRefundableMinor).toBe(25_000);
    expect(outcome.partial).toBe(true);
  });

  it('marks the payment fully refunded when the whole capture is returned', () => {
    const outcome = assessRefund(payment(), money(40_000, 'USD'));
    expect(outcome.nextStatus).toBe(PaymentStatus.REFUNDED);
    expect(outcome.remainingRefundableMinor).toBe(0);
    expect(outcome.partial).toBe(false);
  });

  it('accounts for prior refunds, so two half-refunds cannot exceed the capture', () => {
    // The bug this prevents: refunding 150% of what was taken.
    const first = assessRefund(payment(), money(25_000, 'USD'));
    expect(first.totalRefundedMinor).toBe(25_000);

    const afterFirst = payment({
      refundedMinor: first.totalRefundedMinor,
      status: PaymentStatus.PARTIALLY_REFUNDED,
    });
    expect(() => assessRefund(afterFirst, money(25_000, 'USD'))).toThrow(
      expect.objectContaining({ code: ErrorCode.REFUND_EXCEEDS_CAPTURE }),
    );
    expect(assessRefund(afterFirst, money(15_000, 'USD')).nextStatus).toBe(PaymentStatus.REFUNDED);
  });

  it('rejects a refund larger than the capture', () => {
    expect(() => assessRefund(payment(), money(50_000, 'USD'))).toThrow(
      expect.objectContaining({ code: ErrorCode.REFUND_EXCEEDS_CAPTURE }),
    );
  });

  it('reports the available amount when it rejects', () => {
    expect.assertions(1);
    try {
      assessRefund(payment({ refundedMinor: 30_000 }), money(20_000, 'USD'));
    } catch (error) {
      expect((error as { details?: { availableMinor: number } }).details?.availableMinor).toBe(
        10_000,
      );
    }
  });

  it('rejects a refund in a different currency', () => {
    expect(() => assessRefund(payment(), money(1_000, 'EUR'))).toThrow(
      expect.objectContaining({ code: ErrorCode.CURRENCY_MISMATCH }),
    );
  });

  it('rejects a zero or negative refund', () => {
    expect(() => assessRefund(payment(), money(0, 'USD'))).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
    expect(() => assessRefund(payment(), money(-500, 'USD'))).toThrow();
  });

  it('refuses to refund a payment that was never captured', () => {
    for (const status of [PaymentStatus.AUTHORIZED, PaymentStatus.PENDING, PaymentStatus.FAILED]) {
      expect(() => assessRefund(payment({ status }), money(1_000, 'USD'))).toThrow(
        expect.objectContaining({ code: ErrorCode.CONFLICT }),
      );
    }
  });

  it('refuses a further refund once fully refunded', () => {
    expect(() =>
      assessRefund(
        payment({ status: PaymentStatus.REFUNDED, refundedMinor: 40_000 }),
        money(1_000, 'USD'),
      ),
    ).toThrow(expect.objectContaining({ code: ErrorCode.CONFLICT }));
  });
});
