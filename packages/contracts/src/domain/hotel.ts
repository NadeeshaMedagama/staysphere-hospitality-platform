/** Facilities a property can advertise. Kept closed so search filters stay stable. */
export const AmenityCode = {
  WIFI: 'WIFI',
  PARKING: 'PARKING',
  POOL: 'POOL',
  SPA: 'SPA',
  GYM: 'GYM',
  RESTAURANT: 'RESTAURANT',
  BAR: 'BAR',
  ROOM_SERVICE: 'ROOM_SERVICE',
  LAUNDRY: 'LAUNDRY',
  AIRPORT_SHUTTLE: 'AIRPORT_SHUTTLE',
  BUSINESS_CENTRE: 'BUSINESS_CENTRE',
  PET_FRIENDLY: 'PET_FRIENDLY',
  ACCESSIBLE: 'ACCESSIBLE',
  BEACH_ACCESS: 'BEACH_ACCESS',
  AIR_CONDITIONING: 'AIR_CONDITIONING',
  SAFE: 'SAFE',
  MINIBAR: 'MINIBAR',
  BALCONY: 'BALCONY',
  SEA_VIEW: 'SEA_VIEW',
  KITCHENETTE: 'KITCHENETTE',
} as const;

export type AmenityCode = (typeof AmenityCode)[keyof typeof AmenityCode];

export const HotelStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;

export type HotelStatus = (typeof HotelStatus)[keyof typeof HotelStatus];

/** Property-level rules the booking and stay services enforce. */
export interface HotelPolicy {
  /** Local time in 24-hour `HH:mm`. */
  readonly checkInFrom: string;
  readonly checkOutBy: string;
  readonly minAdvanceHours: number;
  readonly maxStayNights: number;
  readonly cancellationPolicyCode: string;
  readonly childrenAllowed: boolean;
  readonly petsAllowed: boolean;
  readonly smokingAllowed: boolean;
  /** Age below which a guest is counted as a child rather than an adult. */
  readonly childMaxAge: number;
}

export const DEFAULT_HOTEL_POLICY: HotelPolicy = {
  checkInFrom: '14:00',
  checkOutBy: '11:00',
  minAdvanceHours: 0,
  maxStayNights: 90,
  cancellationPolicyCode: 'STANDARD_7_3',
  childrenAllowed: true,
  petsAllowed: false,
  smokingAllowed: false,
  childMaxAge: 12,
};

export const Department = {
  RECEPTION: 'RECEPTION',
  HOUSEKEEPING: 'HOUSEKEEPING',
  MAINTENANCE: 'MAINTENANCE',
  FINANCE: 'FINANCE',
  RESTAURANT: 'RESTAURANT',
  MANAGEMENT: 'MANAGEMENT',
  SECURITY: 'SECURITY',
} as const;

export type Department = (typeof Department)[keyof typeof Department];

/**
 * Parses `HH:mm` into minutes past midnight, returning null when malformed.
 * Used to compare a requested early check-in against the property's policy.
 */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
