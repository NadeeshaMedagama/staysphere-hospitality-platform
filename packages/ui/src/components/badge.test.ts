import { describe, expect, it } from 'vitest';
import { humaniseStatus, statusTone } from './badge';

describe('statusTone', () => {
  it('maps room statuses to distinguishable tones', () => {
    expect(statusTone('AVAILABLE')).toBe('positive');
    expect(statusTone('MAINTENANCE')).toBe('negative');
    expect(statusTone('CLEANING')).toBe('caution');
  });

  it('maps booking, payment and ticket statuses', () => {
    expect(statusTone('CONFIRMED')).toBe('positive');
    expect(statusTone('FAILED')).toBe('negative');
    expect(statusTone('CRITICAL')).toBe('negative');
    expect(statusTone('LOW')).toBe('neutral');
  });

  it('is case-insensitive', () => {
    expect(statusTone('available')).toBe(statusTone('AVAILABLE'));
  });

  it('falls back to neutral for an unknown status rather than throwing', () => {
    expect(statusTone('SOMETHING_NEW')).toBe('neutral');
  });
});

describe('humaniseStatus', () => {
  it('turns a screaming-snake constant into a sentence', () => {
    expect(humaniseStatus('OUT_OF_SERVICE')).toBe('Out of service');
    expect(humaniseStatus('PARTIALLY_REFUNDED')).toBe('Partially refunded');
    expect(humaniseStatus('PENDING')).toBe('Pending');
  });
});
