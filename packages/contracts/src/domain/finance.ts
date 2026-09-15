export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentProvider = {
  STRIPE: 'STRIPE',
  PAYHERE: 'PAYHERE',
  PAYPAL: 'PAYPAL',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;

export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const PaymentMethod = {
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  WALLET: 'WALLET',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const RefundReason = {
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  OVERCHARGE: 'OVERCHARGE',
  SERVICE_FAILURE: 'SERVICE_FAILURE',
  DUPLICATE_CHARGE: 'DUPLICATE_CHARGE',
  GOODWILL: 'GOODWILL',
} as const;

export type RefundReason = (typeof RefundReason)[keyof typeof RefundReason];

/**
 * Tax applied to a folio, expressed in basis points to avoid float drift
 * (1250 === 12.5%).
 */
export interface TaxComponent {
  readonly code: string;
  readonly label: string;
  readonly basisPoints: number;
  /** True when the tax is charged on top of the price rather than included. */
  readonly exclusive: boolean;
}

export const DEFAULT_TAX_COMPONENTS: readonly TaxComponent[] = [
  { code: 'VAT', label: 'Value Added Tax', basisPoints: 1200, exclusive: true },
  { code: 'CITY', label: 'City Tax', basisPoints: 50, exclusive: true },
];
