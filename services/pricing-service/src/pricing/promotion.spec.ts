import { ErrorCode, money } from '@staysphere/contracts';
import {
  PromotionType,
  assertPromotionApplicable,
  assessPromotion,
  type Promotion,
  type RedemptionContext,
} from './promotion';

const basePromotion = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'promo_1',
  code: 'SUMMER25',
  type: PromotionType.PERCENTAGE,
  value: 2500, // 25%
  currency: null,
  validFrom: new Date('2026-06-01T00:00:00Z'),
  validTo: new Date('2026-09-30T23:59:59Z'),
  minNights: 2,
  minSpendMinor: 10_000,
  roomTypeIds: [],
  maxRedemptions: 100,
  redemptionCount: 10,
  maxPerCustomer: 1,
  exclusive: false,
  active: true,
  hotelId: null,
  ...overrides,
});

const baseContext = (overrides: Partial<RedemptionContext> = {}): RedemptionContext => ({
  now: new Date('2026-07-15T12:00:00Z'),
  hotelId: 'htl_1',
  roomTypeId: 'deluxe',
  nights: 3,
  subtotal: money(40_000, 'USD'),
  customerRedemptions: 0,
  ...overrides,
});

describe('assessPromotion', () => {
  it('applies a percentage discount to the subtotal', () => {
    const result = assessPromotion(basePromotion(), baseContext());
    expect(result.applicable).toBe(true);
    expect(result.discount.amountMinor).toBe(10_000);
  });

  it('applies a fixed-amount discount', () => {
    const result = assessPromotion(
      basePromotion({ type: PromotionType.FIXED_AMOUNT, value: 5_000, currency: 'USD' }),
      baseContext(),
    );
    expect(result.discount.amountMinor).toBe(5_000);
  });

  it('caps a fixed discount at the subtotal so the folio never goes negative', () => {
    const result = assessPromotion(
      basePromotion({ type: PromotionType.FIXED_AMOUNT, value: 90_000, currency: 'USD' }),
      baseContext({ subtotal: money(40_000, 'USD') }),
    );
    expect(result.discount.amountMinor).toBe(40_000);
  });

  it('rejects a fixed promotion issued in another currency', () => {
    const result = assessPromotion(
      basePromotion({ type: PromotionType.FIXED_AMOUNT, value: 5_000, currency: 'EUR' }),
      baseContext(),
    );
    expect(result.rejection).toBe('CURRENCY_MISMATCH');
  });

  it('rejects an inactive code', () => {
    expect(assessPromotion(basePromotion({ active: false }), baseContext()).rejection).toBe(
      'INACTIVE',
    );
  });

  it('distinguishes not-yet-valid from expired', () => {
    expect(
      assessPromotion(basePromotion(), baseContext({ now: new Date('2026-05-01T00:00:00Z') }))
        .rejection,
    ).toBe('NOT_YET_VALID');
    expect(
      assessPromotion(basePromotion(), baseContext({ now: new Date('2026-11-01T00:00:00Z') }))
        .rejection,
    ).toBe('EXPIRED');
  });

  it('confines a property-scoped promotion to that property', () => {
    expect(
      assessPromotion(basePromotion({ hotelId: 'htl_2' }), baseContext({ hotelId: 'htl_1' }))
        .rejection,
    ).toBe('WRONG_PROPERTY');
  });

  it('allows a platform-wide promotion at any property', () => {
    expect(
      assessPromotion(basePromotion({ hotelId: null }), baseContext({ hotelId: 'htl_9' }))
        .applicable,
    ).toBe(true);
  });

  it('restricts a promotion to its listed room types', () => {
    expect(
      assessPromotion(
        basePromotion({ roomTypeIds: ['suite'] }),
        baseContext({ roomTypeId: 'deluxe' }),
      ).rejection,
    ).toBe('ROOM_TYPE_EXCLUDED');
    expect(
      assessPromotion(
        basePromotion({ roomTypeIds: ['suite'] }),
        baseContext({ roomTypeId: 'suite' }),
      ).applicable,
    ).toBe(true);
  });

  it('enforces the minimum stay and minimum spend separately', () => {
    expect(assessPromotion(basePromotion(), baseContext({ nights: 1 })).rejection).toBe(
      'STAY_TOO_SHORT',
    );
    expect(
      assessPromotion(basePromotion(), baseContext({ subtotal: money(5_000, 'USD') })).rejection,
    ).toBe('SPEND_TOO_LOW');
  });

  it('stops once the global redemption cap is reached', () => {
    expect(
      assessPromotion(basePromotion({ maxRedemptions: 10, redemptionCount: 10 }), baseContext())
        .rejection,
    ).toBe('FULLY_REDEEMED');
  });

  it('treats a null redemption cap as unlimited', () => {
    expect(
      assessPromotion(
        basePromotion({ maxRedemptions: null, redemptionCount: 99_999 }),
        baseContext(),
      ).applicable,
    ).toBe(true);
  });

  it('enforces the per-customer limit', () => {
    expect(
      assessPromotion(basePromotion(), baseContext({ customerRedemptions: 1 })).rejection,
    ).toBe('CUSTOMER_LIMIT_REACHED');
  });

  it('returns a zero discount in the booking currency when rejected', () => {
    const result = assessPromotion(basePromotion({ active: false }), baseContext());
    expect(result.discount).toEqual({ amountMinor: 0, currency: 'USD' });
  });
});

describe('assertPromotionApplicable', () => {
  it('returns the discount when the code applies', () => {
    expect(assertPromotionApplicable(basePromotion(), baseContext()).amountMinor).toBe(10_000);
  });

  it('throws a guest-readable reason rather than a generic failure', () => {
    expect.assertions(2);
    try {
      assertPromotionApplicable(basePromotion(), baseContext({ nights: 1 }));
    } catch (error) {
      const domainError = error as { code: string; message: string };
      expect(domainError.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(domainError.message).toMatch(/longer stay/);
    }
  });
});
