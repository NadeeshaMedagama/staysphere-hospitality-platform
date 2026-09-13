import { money } from '@staysphere/contracts';
import { STANDARD_CANCELLATION_POLICY, assessRefund } from './cancellation';

const paid = money(40_000, 'USD'); // $400.00
const checkIn = new Date('2026-10-15T14:00:00Z');

describe('assessRefund', () => {
  it('refunds in full with more than seven days notice', () => {
    const result = assessRefund(paid, checkIn, new Date('2026-10-01T14:00:00Z'));
    expect(result.refund.amountMinor).toBe(40_000);
    expect(result.retained.amountMinor).toBe(0);
    expect(result.tier.label).toMatch(/Free cancellation/);
  });

  it('refunds half between three and seven days notice', () => {
    const result = assessRefund(paid, checkIn, new Date('2026-10-10T14:00:00Z'));
    expect(result.refund.amountMinor).toBe(20_000);
    expect(result.retained.amountMinor).toBe(20_000);
  });

  it('refunds nothing under three days notice', () => {
    const result = assessRefund(paid, checkIn, new Date('2026-10-14T14:00:00Z'));
    expect(result.refund.amountMinor).toBe(0);
    expect(result.retained.amountMinor).toBe(40_000);
  });

  it('treats the tier boundary as inclusive, favouring the guest', () => {
    const exactlySevenDays = new Date(checkIn.getTime() - 168 * 3600_000);
    expect(assessRefund(paid, checkIn, exactlySevenDays).refund.amountMinor).toBe(40_000);

    const exactlyThreeDays = new Date(checkIn.getTime() - 72 * 3600_000);
    expect(assessRefund(paid, checkIn, exactlyThreeDays).refund.amountMinor).toBe(20_000);
  });

  it('refunds nothing when cancelled after check-in has passed', () => {
    const result = assessRefund(paid, checkIn, new Date('2026-10-16T09:00:00Z'));
    expect(result.refund.amountMinor).toBe(0);
    expect(result.hoursNotice).toBeLessThan(0);
  });

  it('deducts a non-refundable fee from the refundable portion', () => {
    const policy = { ...STANDARD_CANCELLATION_POLICY, nonRefundableFeeMinor: 5_000 };
    const result = assessRefund(paid, checkIn, new Date('2026-10-01T14:00:00Z'), policy);
    expect(result.refund.amountMinor).toBe(35_000);
    expect(result.retained.amountMinor).toBe(5_000);
  });

  it('never lets a fee push the refund below zero', () => {
    const policy = { ...STANDARD_CANCELLATION_POLICY, nonRefundableFeeMinor: 90_000 };
    const result = assessRefund(paid, checkIn, new Date('2026-10-10T14:00:00Z'), policy);
    expect(result.refund.amountMinor).toBe(0);
    expect(result.retained.amountMinor).toBe(40_000);
  });

  it('always conserves the amount paid across refund and retained', () => {
    for (const iso of ['2026-09-01', '2026-10-09', '2026-10-13', '2026-10-20']) {
      const result = assessRefund(paid, checkIn, new Date(`${iso}T12:00:00Z`));
      expect(result.refund.amountMinor + result.retained.amountMinor).toBe(paid.amountMinor);
    }
  });

  it('preserves the currency of the original payment', () => {
    const lkr = money(120_000, 'LKR');
    expect(assessRefund(lkr, checkIn, new Date('2026-10-01T12:00:00Z')).refund.currency).toBe(
      'LKR',
    );
  });
});
