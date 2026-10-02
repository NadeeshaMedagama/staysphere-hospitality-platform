import { ErrorCode, MaintenancePriority, MaintenanceStatus } from '@staysphere/contracts';
import {
  SLA_HOURS,
  TICKET_TRANSITIONS,
  assertTicketTransition,
  dueAt,
  hoursRemaining,
  isBreached,
  raiseTo,
  triage,
  type TriageInput,
} from './sla';

const reportedAt = new Date('2026-09-09T09:00:00Z');

const input = (overrides: Partial<TriageInput> = {}): TriageInput => ({
  category: 'FURNITURE',
  roomOccupied: false,
  arrivalImminent: false,
  ...overrides,
});

describe('triage', () => {
  it('makes a room-disabling fault critical while a guest is in the room', () => {
    const result = triage(input({ category: 'HVAC_FAILURE', roomOccupied: true }));
    expect(result.priority).toBe(MaintenancePriority.CRITICAL);
    expect(result.takesRoomOffline).toBe(true);
    expect(result.dueInHours).toBe(2);
  });

  it('makes a room-disabling fault high when an arrival is imminent', () => {
    expect(triage(input({ category: 'DOOR_LOCK', arrivalImminent: true })).priority).toBe(
      MaintenancePriority.HIGH,
    );
  });

  it('raises any fault in an occupied room', () => {
    expect(
      triage(
        input({
          category: 'FURNITURE',
          roomOccupied: true,
          reportedPriority: MaintenancePriority.LOW,
        }),
      ).priority,
    ).toBe(MaintenancePriority.HIGH);
  });

  it('respects the reporter’s assessment as a floor but not a ceiling', () => {
    // Reported MEDIUM but the guest is in the room — escalate anyway.
    expect(
      triage(
        input({
          category: 'PLUMBING_MAJOR',
          roomOccupied: true,
          reportedPriority: MaintenancePriority.MEDIUM,
        }),
      ).priority,
    ).toBe(MaintenancePriority.CRITICAL);

    // Reported CRITICAL on a cosmetic fault stays CRITICAL — the reporter may
    // know something the category does not capture.
    expect(
      triage(input({ category: 'FURNITURE', reportedPriority: MaintenancePriority.CRITICAL }))
        .priority,
    ).toBe(MaintenancePriority.CRITICAL);
  });

  it('leaves a cosmetic fault in an empty room at its reported priority', () => {
    const result = triage(input({ reportedPriority: MaintenancePriority.LOW }));
    expect(result.priority).toBe(MaintenancePriority.LOW);
    expect(result.takesRoomOffline).toBe(false);
    expect(result.dueInHours).toBe(72);
  });

  it('flags a disabling category even in an empty room with no arrival', () => {
    const result = triage(input({ category: 'WATER_DAMAGE' }));
    expect(result.takesRoomOffline).toBe(true);
    expect(result.priority).toBe(MaintenancePriority.HIGH);
  });

  it('matches the category case-insensitively', () => {
    expect(triage(input({ category: 'hvac_failure' })).takesRoomOffline).toBe(true);
  });

  it('defaults to MEDIUM when nothing is known', () => {
    expect(triage(input()).priority).toBe(MaintenancePriority.MEDIUM);
  });
});

describe('raiseTo', () => {
  it('takes the more urgent of the two', () => {
    expect(raiseTo(MaintenancePriority.LOW, MaintenancePriority.HIGH)).toBe(
      MaintenancePriority.HIGH,
    );
  });

  it('never lowers an already-urgent priority', () => {
    expect(raiseTo(MaintenancePriority.CRITICAL, MaintenancePriority.MEDIUM)).toBe(
      MaintenancePriority.CRITICAL,
    );
  });
});

describe('SLA deadlines', () => {
  it('tightens as priority rises', () => {
    expect(SLA_HOURS.CRITICAL).toBeLessThan(SLA_HOURS.HIGH);
    expect(SLA_HOURS.HIGH).toBeLessThan(SLA_HOURS.MEDIUM);
    expect(SLA_HOURS.MEDIUM).toBeLessThan(SLA_HOURS.LOW);
  });

  it('computes the deadline from the report time', () => {
    expect(dueAt(reportedAt, MaintenancePriority.CRITICAL).toISOString()).toBe(
      '2026-09-09T11:00:00.000Z',
    );
  });

  it('reports hours remaining, going negative once overdue', () => {
    const due = dueAt(reportedAt, MaintenancePriority.HIGH);
    expect(hoursRemaining(due, new Date('2026-09-09T12:00:00Z'))).toBe(5);
    expect(hoursRemaining(due, new Date('2026-09-09T19:00:00Z'))).toBe(-2);
    expect(hoursRemaining(null, reportedAt)).toBeNull();
  });
});

describe('isBreached', () => {
  const due = new Date('2026-09-09T11:00:00Z');

  it('is false before the deadline', () => {
    expect(isBreached(due, MaintenanceStatus.IN_PROGRESS, new Date('2026-09-09T10:00:00Z'))).toBe(
      false,
    );
  });

  it('is true once an open ticket passes its deadline', () => {
    expect(isBreached(due, MaintenanceStatus.ASSIGNED, new Date('2026-09-09T12:00:00Z'))).toBe(
      true,
    );
  });

  it('never breaches a ticket that is already done', () => {
    // The work finished; the clock stops.
    for (const status of [MaintenanceStatus.RESOLVED, MaintenanceStatus.CLOSED]) {
      expect(isBreached(due, status, new Date('2026-09-20T00:00:00Z'))).toBe(false);
    }
  });

  it('is false when no deadline was set', () => {
    expect(isBreached(null, MaintenanceStatus.REPORTED, new Date())).toBe(false);
  });
});

describe('ticket state machine', () => {
  it('follows report, assign, start, resolve, close', () => {
    expect(() =>
      assertTicketTransition(MaintenanceStatus.REPORTED, MaintenanceStatus.ASSIGNED),
    ).not.toThrow();
    expect(() =>
      assertTicketTransition(MaintenanceStatus.ASSIGNED, MaintenanceStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertTicketTransition(MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.RESOLVED),
    ).not.toThrow();
    expect(() =>
      assertTicketTransition(MaintenanceStatus.RESOLVED, MaintenanceStatus.CLOSED),
    ).not.toThrow();
  });

  it('allows a resolved ticket to be reopened when the fault returns', () => {
    expect(() =>
      assertTicketTransition(MaintenanceStatus.RESOLVED, MaintenanceStatus.ASSIGNED),
    ).not.toThrow();
  });

  it('allows a duplicate to be closed without any work', () => {
    expect(() =>
      assertTicketTransition(MaintenanceStatus.REPORTED, MaintenanceStatus.CLOSED),
    ).not.toThrow();
  });

  it('refuses to resolve a ticket nobody has started', () => {
    expect(() =>
      assertTicketTransition(MaintenanceStatus.REPORTED, MaintenanceStatus.RESOLVED),
    ).toThrow(expect.objectContaining({ code: ErrorCode.CONFLICT }));
  });

  it('treats a closed ticket as final', () => {
    expect(TICKET_TRANSITIONS[MaintenanceStatus.CLOSED]).toHaveLength(0);
  });
});
