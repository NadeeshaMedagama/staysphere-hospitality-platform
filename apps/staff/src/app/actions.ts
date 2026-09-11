'use server';

import { revalidatePath } from 'next/cache';
import { ErrorCode } from '@staysphere/contracts';
import { gatewayFetch } from '@staysphere/app-core';
import { requireSession } from '@/lib/session';

export interface ActionState {
  readonly error?: string;
}

/**
 * Turns a service error into something a member of staff can act on mid-shift.
 *
 * A 409 here is almost always a real operational answer — the task moved on, or
 * a rule refused it — rather than a fault, so it is shown as the service worded
 * it rather than replaced with a generic apology.
 */
function message(code: ErrorCode, detail: string): string {
  switch (code) {
    case ErrorCode.FORBIDDEN:
      return 'Your role does not allow this.';
    case ErrorCode.NOT_FOUND:
      return 'That record no longer exists. Refresh to see the current state.';
    case ErrorCode.UPSTREAM_UNAVAILABLE:
    case ErrorCode.UPSTREAM_TIMEOUT:
    case ErrorCode.CIRCUIT_OPEN:
      return 'The service is not responding. Nothing was changed — try again shortly.';
    default:
      return detail;
  }
}

async function post(path: string, body: unknown, revalidate: string): Promise<ActionState> {
  const session = await requireSession();
  const result = await gatewayFetch(path, {
    method: 'POST',
    body,
    accessToken: session.accessToken,
  });

  if (!result.ok) return { error: message(result.code, result.message) };

  // The list this action was invoked from is now stale.
  revalidatePath(revalidate);
  return {};
}

export async function takeHousekeepingTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const id = String(formData.get('id') ?? '');
  return post(`/housekeeping/tasks/${id}/assign`, { staffId: session.user.id }, '/housekeeping');
}

export async function startHousekeepingTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  return post(`/housekeeping/tasks/${id}/start`, {}, '/housekeeping');
}

export async function completeHousekeepingTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();
  return post(
    `/housekeeping/tasks/${id}/complete`,
    { checklist: [], ...(notes ? { notes } : {}) },
    '/housekeeping',
  );
}

export async function takeMaintenanceTicket(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const id = String(formData.get('id') ?? '');
  return post(
    `/maintenance/tickets/${id}/assign`,
    { staffId: session.user.id, staffName: session.user.fullName },
    '/maintenance',
  );
}

export async function startMaintenanceTicket(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  return post(`/maintenance/tickets/${id}/start`, {}, '/maintenance');
}

export async function resolveMaintenanceTicket(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  const notes = String(formData.get('resolutionNotes') ?? '').trim();

  // The service requires at least five characters; catching it here keeps a
  // pointless round trip off a corridor tablet's connection.
  if (notes.length < 5) {
    return { error: 'Describe the fix in a few words before resolving.' };
  }

  return post(
    `/maintenance/tickets/${id}/resolve`,
    { resolutionNotes: notes, returnRoomToService: true },
    '/maintenance',
  );
}
