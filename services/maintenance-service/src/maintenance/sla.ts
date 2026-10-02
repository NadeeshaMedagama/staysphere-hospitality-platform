import {
  DomainError,
  ErrorCode,
  MaintenancePriority,
  MaintenanceStatus,
} from '@staysphere/contracts';

/**
 * Response targets by priority, in hours.
 *
 * These are resolution deadlines, not acknowledgement ones: a guest does not
 * care that a ticket was seen, only that the shower works.
 */
export const SLA_HOURS: Record<MaintenancePriority, number> = {
  CRITICAL: 2,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

/** Fault categories that take a room out of sale until they are fixed. */
export const ROOM_DISABLING_CATEGORIES = new Set([
  'PLUMBING_MAJOR',
  'ELECTRICAL_MAJOR',
  'HVAC_FAILURE',
  'DOOR_LOCK',
  'WATER_DAMAGE',
  'PEST',
  'SAFETY',
]);

export interface TriageInput {
  readonly category: string;
  /** True when a guest is currently in the room. */
  readonly roomOccupied: boolean;
  /** True when the room has an arrival within the next 24 hours. */
  readonly arrivalImminent: boolean;
  readonly reportedPriority?: MaintenancePriority;
}

export interface Triage {
  readonly priority: MaintenancePriority;
  readonly takesRoomOffline: boolean;
  readonly dueInHours: number;
}

/**
 * Assigns a priority to a fault.
 *
 * The reporter's own assessment is respected as a floor but never a ceiling:
 * a receptionist logging "no hot water" as MEDIUM in an occupied room still
 * gets escalated, because the guest is in it now.
 */
export function triage(input: TriageInput): Triage {
  const disabling = ROOM_DISABLING_CATEGORIES.has(input.category.toUpperCase());

  let priority: MaintenancePriority = input.reportedPriority ?? MaintenancePriority.MEDIUM;

  if (disabling && input.roomOccupied) {
    priority = MaintenancePriority.CRITICAL;
  } else if (disabling && input.arrivalImminent) {
    priority = MaintenancePriority.HIGH;
  } else if (disabling) {
    priority = raiseTo(priority, MaintenancePriority.HIGH);
  } else if (input.roomOccupied) {
    priority = raiseTo(priority, MaintenancePriority.HIGH);
  }

  return {
    priority,
    takesRoomOffline: disabling,
    dueInHours: SLA_HOURS[priority],
  };
}

const PRIORITY_RANK: Record<MaintenancePriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Returns whichever of the two priorities is more urgent. */
export function raiseTo(
  current: MaintenancePriority,
  floor: MaintenancePriority,
): MaintenancePriority {
  return PRIORITY_RANK[floor] < PRIORITY_RANK[current] ? floor : current;
}

export function dueAt(reportedAt: Date, priority: MaintenancePriority): Date {
  return new Date(reportedAt.getTime() + SLA_HOURS[priority] * 3_600_000);
}

export function isBreached(due: Date | null, status: MaintenanceStatus, now: Date): boolean {
  if (!due) return false;
  // A resolved or closed ticket cannot breach; the work is done.
  if (status === MaintenanceStatus.RESOLVED || status === MaintenanceStatus.CLOSED) return false;
  return now > due;
}

/** Hours remaining before breach; negative once overdue. */
export function hoursRemaining(due: Date | null, now: Date): number | null {
  if (!due) return null;
  return Math.round(((due.getTime() - now.getTime()) / 3_600_000) * 10) / 10;
}

export const TICKET_TRANSITIONS: Readonly<Record<MaintenanceStatus, readonly MaintenanceStatus[]>> =
  {
    [MaintenanceStatus.REPORTED]: [MaintenanceStatus.ASSIGNED, MaintenanceStatus.CLOSED],
    [MaintenanceStatus.ASSIGNED]: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.REPORTED],
    [MaintenanceStatus.IN_PROGRESS]: [MaintenanceStatus.RESOLVED, MaintenanceStatus.ASSIGNED],
    // Reopening a resolved ticket is normal — the fault came back.
    [MaintenanceStatus.RESOLVED]: [MaintenanceStatus.CLOSED, MaintenanceStatus.ASSIGNED],
    [MaintenanceStatus.CLOSED]: [],
  };

export function assertTicketTransition(from: MaintenanceStatus, to: MaintenanceStatus): void {
  if (!TICKET_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      ErrorCode.CONFLICT,
      `A maintenance ticket cannot move from ${from} to ${to}.`,
      { details: { from, to, allowed: TICKET_TRANSITIONS[from] } },
    );
  }
}
