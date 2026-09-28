import { DomainError, ErrorCode, HousekeepingTaskStatus } from '@staysphere/contracts';

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskType = {
  CHECKOUT_CLEAN: 'CHECKOUT_CLEAN',
  STAYOVER_CLEAN: 'STAYOVER_CLEAN',
  DEEP_CLEAN: 'DEEP_CLEAN',
  INSPECTION: 'INSPECTION',
  TURNDOWN: 'TURNDOWN',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export interface PrioritisationInput {
  readonly type: TaskType;
  /** When the next guest is due in this room, if one is. */
  readonly nextArrivalAt: Date | null;
  readonly now: Date;
  /** True when the room is being re-cleaned after a failed inspection. */
  readonly isRework: boolean;
  /** True when the arriving or in-house guest is flagged VIP. */
  readonly vip: boolean;
}

/**
 * Works out how urgent a cleaning task is.
 *
 * The dominant signal is the next arrival. A room with a guest due in two hours
 * has to be cleaned before one with no arrival at all, regardless of which was
 * queued first — a guest waiting in reception is the failure this ordering
 * exists to prevent.
 *
 * Rework outranks everything: the room was already reported clean, a guest may
 * be on their way to it, and it is not.
 */
export function computePriority(input: PrioritisationInput): TaskPriority {
  if (input.isRework) return TaskPriority.CRITICAL;

  if (input.nextArrivalAt) {
    const hoursUntilArrival = (input.nextArrivalAt.getTime() - input.now.getTime()) / 3_600_000;

    if (hoursUntilArrival <= 2) return TaskPriority.CRITICAL;
    if (hoursUntilArrival <= 6) return TaskPriority.HIGH;
    if (hoursUntilArrival <= 24) return input.vip ? TaskPriority.HIGH : TaskPriority.MEDIUM;
  }

  if (input.vip) return TaskPriority.HIGH;

  switch (input.type) {
    case TaskType.CHECKOUT_CLEAN:
      return TaskPriority.MEDIUM;
    case TaskType.TURNDOWN:
    case TaskType.STAYOVER_CLEAN:
      return TaskPriority.MEDIUM;
    case TaskType.INSPECTION:
      return TaskPriority.LOW;
    case TaskType.DEEP_CLEAN:
      return TaskPriority.LOW;
    default:
      return TaskPriority.MEDIUM;
  }
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface SortableTask {
  readonly priority: TaskPriority;
  readonly nextArrivalAt: Date | null;
  readonly floor: number;
  readonly roomNumber: string;
}

/**
 * Orders the housekeeping queue.
 *
 * Priority first, then the soonest arrival, then by floor and room number — the
 * last two so a housekeeper works one corridor at a time instead of criss-crossing
 * the building.
 */
export function compareTasks(a: SortableTask, b: SortableTask): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  const arrivalA = a.nextArrivalAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const arrivalB = b.nextArrivalAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (arrivalA !== arrivalB) return arrivalA - arrivalB;

  if (a.floor !== b.floor) return a.floor - b.floor;
  return a.roomNumber.localeCompare(b.roomNumber, 'en', { numeric: true });
}

/** Typical minutes for each kind of clean, used to plan a shift's workload. */
export const EXPECTED_MINUTES: Record<TaskType, number> = {
  CHECKOUT_CLEAN: 35,
  STAYOVER_CLEAN: 20,
  DEEP_CLEAN: 90,
  INSPECTION: 10,
  TURNDOWN: 10,
};

export interface ShiftCapacity {
  readonly staffId: string;
  readonly staffName: string;
  readonly capacity: number;
  readonly assignedCount: number;
}

/**
 * Picks who should take the next task.
 *
 * The least-loaded housekeeper with capacity remaining wins, so work spreads
 * evenly rather than piling onto whoever appears first in the roster.
 */
export function selectAssignee(shifts: readonly ShiftCapacity[]): ShiftCapacity {
  const available = shifts
    .filter((shift) => shift.assignedCount < shift.capacity)
    .sort((a, b) => {
      const loadA = a.assignedCount / a.capacity;
      const loadB = b.assignedCount / b.capacity;
      if (loadA !== loadB) return loadA - loadB;
      return a.staffId.localeCompare(b.staffId);
    });

  const chosen = available[0];
  if (!chosen) {
    throw new DomainError(ErrorCode.CONFLICT, 'Every housekeeper on shift is at capacity.', {
      details: { onShift: shifts.length },
    });
  }
  return chosen;
}

/** Transitions a housekeeping task may make. */
export const TASK_TRANSITIONS: Readonly<
  Record<HousekeepingTaskStatus, readonly HousekeepingTaskStatus[]>
> = {
  [HousekeepingTaskStatus.PENDING]: [HousekeepingTaskStatus.ASSIGNED],
  [HousekeepingTaskStatus.ASSIGNED]: [
    HousekeepingTaskStatus.IN_PROGRESS,
    HousekeepingTaskStatus.PENDING,
  ],
  [HousekeepingTaskStatus.IN_PROGRESS]: [HousekeepingTaskStatus.COMPLETED],
  // A failed inspection sends the room back to ASSIGNED as rework.
  [HousekeepingTaskStatus.COMPLETED]: [
    HousekeepingTaskStatus.VERIFIED,
    HousekeepingTaskStatus.ASSIGNED,
  ],
  [HousekeepingTaskStatus.VERIFIED]: [],
};

export function assertTaskTransition(
  from: HousekeepingTaskStatus,
  to: HousekeepingTaskStatus,
): void {
  if (!TASK_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      ErrorCode.CONFLICT,
      `A housekeeping task cannot move from ${from} to ${to}.`,
      { details: { from, to, allowed: TASK_TRANSITIONS[from] } },
    );
  }
}
