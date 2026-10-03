/** Lifecycle of an in-house stay, distinct from the reservation that created it. */
export const StayStatus = {
  IN_HOUSE: 'IN_HOUSE',
  CHECKED_OUT: 'CHECKED_OUT',
  /** Guest left without settling; the folio stays open for collection. */
  DEPARTED_UNSETTLED: 'DEPARTED_UNSETTLED',
} as const;

export type StayStatus = (typeof StayStatus)[keyof typeof StayStatus];

/** Chargeable extras a guest can add during a stay. */
export const ServiceCode = {
  BREAKFAST: 'BREAKFAST',
  LUNCH: 'LUNCH',
  DINNER: 'DINNER',
  ROOM_SERVICE: 'ROOM_SERVICE',
  MINIBAR: 'MINIBAR',
  LAUNDRY: 'LAUNDRY',
  SPA_TREATMENT: 'SPA_TREATMENT',
  AIRPORT_PICKUP: 'AIRPORT_PICKUP',
  AIRPORT_DROPOFF: 'AIRPORT_DROPOFF',
  PARKING: 'PARKING',
  EXTRA_BED: 'EXTRA_BED',
  LATE_CHECKOUT: 'LATE_CHECKOUT',
  EARLY_CHECKIN: 'EARLY_CHECKIN',
  TOUR_PACKAGE: 'TOUR_PACKAGE',
  PET_FEE: 'PET_FEE',
} as const;

export type ServiceCode = (typeof ServiceCode)[keyof typeof ServiceCode];

export const ServiceRequestStatus = {
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

export type ServiceRequestStatus = (typeof ServiceRequestStatus)[keyof typeof ServiceRequestStatus];

/** How a folio line came to exist — drives how it is grouped on the invoice. */
export const FolioLineKind = {
  ROOM: 'ROOM',
  SERVICE: 'SERVICE',
  TAX: 'TAX',
  DISCOUNT: 'DISCOUNT',
  ADJUSTMENT: 'ADJUSTMENT',
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
} as const;

export type FolioLineKind = (typeof FolioLineKind)[keyof typeof FolioLineKind];

/** Lines that increase what the guest owes; the rest reduce it. */
export const DEBIT_LINE_KINDS: readonly FolioLineKind[] = [
  FolioLineKind.ROOM,
  FolioLineKind.SERVICE,
  FolioLineKind.TAX,
  FolioLineKind.ADJUSTMENT,
];
