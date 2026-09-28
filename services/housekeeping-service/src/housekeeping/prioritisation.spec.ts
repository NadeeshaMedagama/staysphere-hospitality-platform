import { ErrorCode, HousekeepingTaskStatus } from '@staysphere/contracts';
import {
  EXPECTED_MINUTES,
  TaskPriority,
  TaskType,
  assertTaskTransition,
  compareTasks,
  computePriority,
  selectAssignee,
  type PrioritisationInput,
  type ShiftCapacity,
  type SortableTask,
} from './prioritisation';

const now = new Date('2026-09-09T09:00:00Z');

const input = (overrides: Partial<PrioritisationInput> = {}): PrioritisationInput => ({
  type: TaskType.CHECKOUT_CLEAN,
  nextArrivalAt: null,
  now,
  isRework: false,
  vip: false,
  ...overrides,
});

const inHours = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe('computePriority', () => {
  it('makes rework critical regardless of anything else', () => {
    // The room was reported clean and is not — a guest may already be heading there.
    expect(computePriority(input({ isRework: true }))).toBe(TaskPriority.CRITICAL);
    expect(computePriority(input({ isRework: true, type: TaskType.DEEP_CLEAN }))).toBe(
      TaskPriority.CRITICAL,
    );
  });

  it('escalates as the next arrival approaches', () => {
    expect(computePriority(input({ nextArrivalAt: inHours(1) }))).toBe(TaskPriority.CRITICAL);
    expect(computePriority(input({ nextArrivalAt: inHours(4) }))).toBe(TaskPriority.HIGH);
    expect(computePriority(input({ nextArrivalAt: inHours(20) }))).toBe(TaskPriority.MEDIUM);
  });

  it('lifts a same-day VIP arrival above an ordinary one', () => {
    expect(computePriority(input({ nextArrivalAt: inHours(20), vip: true }))).toBe(
      TaskPriority.HIGH,
    );
  });

  it('treats a far-off arrival as no arrival pressure', () => {
    expect(computePriority(input({ nextArrivalAt: inHours(72) }))).toBe(TaskPriority.MEDIUM);
  });

  it('deprioritises work with no guest waiting on it', () => {
    expect(computePriority(input({ type: TaskType.DEEP_CLEAN }))).toBe(TaskPriority.LOW);
    expect(computePriority(input({ type: TaskType.INSPECTION }))).toBe(TaskPriority.LOW);
  });

  it('raises a VIP room even without a pending arrival', () => {
    expect(computePriority(input({ vip: true, type: TaskType.STAYOVER_CLEAN }))).toBe(
      TaskPriority.HIGH,
    );
  });
});

describe('compareTasks', () => {
  const task = (overrides: Partial<SortableTask>): SortableTask => ({
    priority: TaskPriority.MEDIUM,
    nextArrivalAt: null,
    floor: 1,
    roomNumber: '101',
    ...overrides,
  });

  it('orders by priority first', () => {
    const sorted = [
      task({ priority: TaskPriority.LOW, roomNumber: '101' }),
      task({ priority: TaskPriority.CRITICAL, roomNumber: '505' }),
      task({ priority: TaskPriority.HIGH, roomNumber: '303' }),
    ].sort(compareTasks);
    expect(sorted.map((t) => t.roomNumber)).toEqual(['505', '303', '101']);
  });

  it('breaks a priority tie by the soonest arrival', () => {
    const sorted = [
      task({ nextArrivalAt: inHours(8), roomNumber: '201' }),
      task({ nextArrivalAt: inHours(3), roomNumber: '202' }),
    ].sort(compareTasks);
    expect(sorted[0]?.roomNumber).toBe('202');
  });

  it('keeps a housekeeper on one corridor when everything else is equal', () => {
    const sorted = [
      task({ floor: 3, roomNumber: '301' }),
      task({ floor: 1, roomNumber: '110' }),
      task({ floor: 1, roomNumber: '102' }),
    ].sort(compareTasks);
    expect(sorted.map((t) => t.roomNumber)).toEqual(['102', '110', '301']);
  });

  it('places rooms with no arrival after those that have one', () => {
    const sorted = [
      task({ nextArrivalAt: null, roomNumber: '201' }),
      task({ nextArrivalAt: inHours(10), roomNumber: '202' }),
    ].sort(compareTasks);
    expect(sorted[0]?.roomNumber).toBe('202');
  });
});

describe('selectAssignee', () => {
  const shift = (overrides: Partial<ShiftCapacity>): ShiftCapacity => ({
    staffId: 'hk_1',
    staffName: 'A. Perera',
    capacity: 14,
    assignedCount: 0,
    ...overrides,
  });

  it('gives the task to the least-loaded housekeeper', () => {
    const chosen = selectAssignee([
      shift({ staffId: 'hk_1', assignedCount: 10 }),
      shift({ staffId: 'hk_2', assignedCount: 3 }),
      shift({ staffId: 'hk_3', assignedCount: 7 }),
    ]);
    expect(chosen.staffId).toBe('hk_2');
  });

  it('compares proportional load, not raw counts', () => {
    // 4/20 is lighter than 3/6.
    const chosen = selectAssignee([
      shift({ staffId: 'hk_1', capacity: 6, assignedCount: 3 }),
      shift({ staffId: 'hk_2', capacity: 20, assignedCount: 4 }),
    ]);
    expect(chosen.staffId).toBe('hk_2');
  });

  it('skips anyone already at capacity', () => {
    const chosen = selectAssignee([
      shift({ staffId: 'hk_1', capacity: 5, assignedCount: 5 }),
      shift({ staffId: 'hk_2', capacity: 5, assignedCount: 4 }),
    ]);
    expect(chosen.staffId).toBe('hk_2');
  });

  it('is deterministic when two housekeepers are equally loaded', () => {
    const shifts = [shift({ staffId: 'hk_2' }), shift({ staffId: 'hk_1' })];
    expect(selectAssignee(shifts).staffId).toBe('hk_1');
  });

  it('fails clearly when the whole shift is at capacity', () => {
    expect(() => selectAssignee([shift({ capacity: 3, assignedCount: 3 })])).toThrow(
      expect.objectContaining({ code: ErrorCode.CONFLICT }),
    );
  });

  it('fails clearly when nobody is on shift', () => {
    expect(() => selectAssignee([])).toThrow();
  });
});

describe('task state machine', () => {
  it('follows assign, start, complete, verify', () => {
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.PENDING, HousekeepingTaskStatus.ASSIGNED),
    ).not.toThrow();
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.ASSIGNED, HousekeepingTaskStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.IN_PROGRESS, HousekeepingTaskStatus.COMPLETED),
    ).not.toThrow();
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.COMPLETED, HousekeepingTaskStatus.VERIFIED),
    ).not.toThrow();
  });

  it('sends a failed inspection back for rework', () => {
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.COMPLETED, HousekeepingTaskStatus.ASSIGNED),
    ).not.toThrow();
  });

  it('refuses to skip straight from pending to complete', () => {
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.PENDING, HousekeepingTaskStatus.COMPLETED),
    ).toThrow(expect.objectContaining({ code: ErrorCode.CONFLICT }));
  });

  it('treats a verified task as final', () => {
    expect(() =>
      assertTaskTransition(HousekeepingTaskStatus.VERIFIED, HousekeepingTaskStatus.ASSIGNED),
    ).toThrow();
  });
});

describe('EXPECTED_MINUTES', () => {
  it('budgets more time for a checkout clean than a stayover', () => {
    expect(EXPECTED_MINUTES.CHECKOUT_CLEAN).toBeGreaterThan(EXPECTED_MINUTES.STAYOVER_CLEAN);
  });

  it('covers every task type', () => {
    for (const type of Object.values(TaskType)) {
      expect(EXPECTED_MINUTES[type]).toBeGreaterThan(0);
    }
  });
});
