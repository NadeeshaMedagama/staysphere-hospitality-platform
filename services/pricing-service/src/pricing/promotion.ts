import { DomainError, ErrorCode, money, multiplyMoney, type Money } from '@staysphere/contracts';

export const PromotionType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type PromotionType = (typeof PromotionType)[keyof typeof PromotionType];

export interface Promotion {
  readonly id: string;
  readonly code: string;
  readonly type: PromotionType;
  /** Basis points for PERCENTAGE, minor units for FIXED_AMOUNT. */
  readonly value: number;
  readonly currency: string | null;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly minNights: number;
  readonly minSpendMinor: number;
  readonly roomTypeIds: readonly string[];
  readonly maxRedemptions: number | null;
  readonly redemptionCount: number;
  readonly maxPerCustomer: number;
  readonly exclusive: boolean;
  readonly active: boolean;
  readonly hotelId: string | null;
}

export interface RedemptionContext {
  readonly now: Date;
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly nights: number;
  readonly subtotal: Money;
  /** How many times this customer has already used this code. */
  readonly customerRedemptions: number;
}

export type PromotionRejection =
  | 'INACTIVE'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'WRONG_PROPERTY'
  | 'ROOM_TYPE_EXCLUDED'
  | 'STAY_TOO_SHORT'
  | 'SPEND_TOO_LOW'
  | 'CURRENCY_MISMATCH'
  | 'FULLY_REDEEMED'
  | 'CUSTOMER_LIMIT_REACHED';

export interface PromotionAssessment {
  readonly applicable: boolean;
  readonly rejection?: PromotionRejection;
  readonly discount: Money;
}

const REJECTION_MESSAGES: Record<PromotionRejection, string> = {
  INACTIVE: 'This promotion code is no longer active.',
  NOT_YET_VALID: 'This promotion has not started yet.',
  EXPIRED: 'This promotion has expired.',
  WRONG_PROPERTY: 'This promotion cannot be used at this property.',
  ROOM_TYPE_EXCLUDED: 'This promotion does not apply to the selected room type.',
  STAY_TOO_SHORT: 'This promotion requires a longer stay.',
  SPEND_TOO_LOW: 'This booking does not reach the minimum spend for this promotion.',
  CURRENCY_MISMATCH: 'This promotion is issued in a different currency.',
  FULLY_REDEEMED: 'This promotion has been fully redeemed.',
  CUSTOMER_LIMIT_REACHED: 'You have already used this promotion the maximum number of times.',
};

/**
 * Evaluates a promotion against a specific booking.
 *
 * Every rejection reason is distinct so the guest is told what is actually
 * wrong — "requires a longer stay" is actionable where "invalid code" is not.
 * The checks run cheapest-first, and eligibility is decided before any money is
 * computed.
 */
export function assessPromotion(
  promotion: Promotion,
  context: RedemptionContext,
): PromotionAssessment {
  const zero = money(0, context.subtotal.currency);
  const reject = (rejection: PromotionRejection): PromotionAssessment => ({
    applicable: false,
    rejection,
    discount: zero,
  });

  if (!promotion.active) return reject('INACTIVE');
  if (context.now < promotion.validFrom) return reject('NOT_YET_VALID');
  if (context.now > promotion.validTo) return reject('EXPIRED');

  // A null hotelId means a platform-wide promotion.
  if (promotion.hotelId !== null && promotion.hotelId !== context.hotelId) {
    return reject('WRONG_PROPERTY');
  }
  if (promotion.roomTypeIds.length > 0 && !promotion.roomTypeIds.includes(context.roomTypeId)) {
    return reject('ROOM_TYPE_EXCLUDED');
  }
  if (context.nights < promotion.minNights) return reject('STAY_TOO_SHORT');
  if (context.subtotal.amountMinor < promotion.minSpendMinor) return reject('SPEND_TOO_LOW');

  if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
    return reject('FULLY_REDEEMED');
  }
  if (context.customerRedemptions >= promotion.maxPerCustomer) {
    return reject('CUSTOMER_LIMIT_REACHED');
  }

  if (promotion.type === PromotionType.FIXED_AMOUNT) {
    if (promotion.currency && promotion.currency !== context.subtotal.currency) {
      return reject('CURRENCY_MISMATCH');
    }
    // A fixed discount can never exceed the bill, or the folio goes negative.
    const capped = Math.min(promotion.value, context.subtotal.amountMinor);
    return { applicable: true, discount: money(capped, context.subtotal.currency) };
  }

  return {
    applicable: true,
    discount: multiplyMoney(context.subtotal, promotion.value / 10_000),
  };
}

export function assertPromotionApplicable(promotion: Promotion, context: RedemptionContext): Money {
  const assessment = assessPromotion(promotion, context);
  if (!assessment.applicable) {
    const rejection = assessment.rejection ?? 'INACTIVE';
    throw new DomainError(ErrorCode.VALIDATION_FAILED, REJECTION_MESSAGES[rejection], {
      details: { code: promotion.code, reason: rejection },
    });
  }
  return assessment.discount;
}
