/** Operational state of a physical room. */
export const RoomStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

/** Statuses in which a room may be sold to a guest. */
export const SELLABLE_ROOM_STATUSES: readonly RoomStatus[] = [
  RoomStatus.AVAILABLE,
  RoomStatus.RESERVED,
];

export const RoomTypeCode = {
  SINGLE: 'SINGLE',
  DOUBLE: 'DOUBLE',
  TWIN: 'TWIN',
  DELUXE: 'DELUXE',
  SUITE: 'SUITE',
  FAMILY: 'FAMILY',
  PRESIDENTIAL: 'PRESIDENTIAL',
} as const;

export type RoomTypeCode = (typeof RoomTypeCode)[keyof typeof RoomTypeCode];

export const HousekeepingTaskStatus = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  VERIFIED: 'VERIFIED',
} as const;

export type HousekeepingTaskStatus =
  (typeof HousekeepingTaskStatus)[keyof typeof HousekeepingTaskStatus];

export const MaintenancePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type MaintenancePriority = (typeof MaintenancePriority)[keyof typeof MaintenancePriority];

export const MaintenanceStatus = {
  REPORTED: 'REPORTED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type MaintenanceStatus = (typeof MaintenanceStatus)[keyof typeof MaintenanceStatus];
