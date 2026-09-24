import { describe, expect, it } from 'vitest';
import { addMoney, formatMoney, money, multiplyMoney, subtractMoney, sumMoney } from './money.js';

describe('money', () => {
  it('rejects fractional minor units so currency never drifts', () => {
    expect(() => money(120.5, 'USD')).toThrow(TypeError);
  });

  it('normalises the currency code to uppercase', () => {
    expect(money(1000, 'usd').currency).toBe('USD');
  });

  it('adds and subtracts within a currency', () => {
    const a = money(12050, 'USD');
    const b = money(4950, 'USD');
    expect(addMoney(a, b).amountMinor).toBe(17000);
    expect(subtractMoney(a, b).amountMinor).toBe(7100);
  });

  it('refuses arithmetic across currencies', () => {
    expect(() => addMoney(money(100, 'USD'), money(100, 'EUR'))).toThrow(/Currency mismatch/);
  });

  it('rounds multiplication to whole minor units', () => {
    // 12050 * 0.155 = 1867.75 -> 1868
    expect(multiplyMoney(money(12050, 'USD'), 0.155).amountMinor).toBe(1868);
  });

  it('sums a line-item list and keeps an empty list at zero', () => {
    const lines = [money(30000, 'USD'), money(5000, 'USD'), money(3500, 'USD')];
    expect(sumMoney(lines, 'USD').amountMinor).toBe(38500);
    expect(sumMoney([], 'USD').amountMinor).toBe(0);
  });

  it('formats for display', () => {
    expect(formatMoney(money(40350, 'USD'))).toBe('$403.50');
  });
});
