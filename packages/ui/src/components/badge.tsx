import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type BadgeTone = 'neutral' | 'positive' | 'caution' | 'negative' | 'info' | 'brand';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-canvas text-ink-700',
  positive: 'border-positive/30 bg-positive-soft text-positive',
  caution: 'border-caution/30 bg-caution-soft text-caution',
  negative: 'border-negative/30 bg-negative-soft text-negative',
  info: 'border-info/30 bg-info-soft text-info',
  brand: 'border-brand-500/30 bg-brand-50 text-brand-700',
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Room, booking and ticket statuses rendered consistently.
 *
 * The label is always written out alongside the colour. Status conveyed by hue
 * alone is unreadable for colour-blind staff and washes out on the low-quality
 * monitors most front desks actually have.
 */
const STATUS_TONES: Record<string, BadgeTone> = {
  // Rooms
  AVAILABLE: 'positive',
  OCCUPIED: 'info',
  RESERVED: 'brand',
  CLEANING: 'caution',
  MAINTENANCE: 'negative',
  OUT_OF_SERVICE: 'neutral',
  // Bookings
  PENDING: 'caution',
  CONFIRMED: 'positive',
  CHECKED_IN: 'info',
  CHECKED_OUT: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW: 'negative',
  // Payments and invoices
  COMPLETED: 'positive',
  AUTHORIZED: 'info',
  FAILED: 'negative',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'caution',
  PAID: 'positive',
  ISSUED: 'info',
  OVERDUE: 'negative',
  VOID: 'neutral',
  // Tasks and tickets
  ASSIGNED: 'info',
  IN_PROGRESS: 'caution',
  VERIFIED: 'positive',
  REPORTED: 'caution',
  RESOLVED: 'positive',
  CLOSED: 'neutral',
  // Priorities
  CRITICAL: 'negative',
  HIGH: 'caution',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status.toUpperCase()] ?? 'neutral';
}

/** Turns `OUT_OF_SERVICE` into `Out of service`. */
export function humaniseStatus(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface StatusBadgeProps {
  readonly status: string;
  readonly className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {humaniseStatus(status)}
    </Badge>
  );
}
