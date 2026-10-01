import { ErrorCode } from '@staysphere/contracts';
import { Alert } from '@staysphere/ui';
import type { GatewayResult } from '@staysphere/app-core';

type Failure = Extract<GatewayResult<unknown>, { ok: false }>;

/**
 * Renders a failed read.
 *
 * "The service is down", "you are not allowed to see this" and "there is
 * nothing here" are three different situations, and a workspace that shows one
 * message for all three teaches staff to ignore it. Only the first is an
 * incident.
 */
export function SectionFailure({ failure, service }: { failure: Failure; service: string }) {
  if (failure.code === ErrorCode.FORBIDDEN) {
    return (
      <Alert tone="caution" title="Not available to your role">
        Your account does not carry the permission this workspace requires. A manager can grant it.
      </Alert>
    );
  }

  if (
    failure.code === ErrorCode.UPSTREAM_UNAVAILABLE ||
    failure.code === ErrorCode.UPSTREAM_TIMEOUT ||
    failure.code === ErrorCode.CIRCUIT_OPEN
  ) {
    return (
      <Alert tone="negative" title={`${service} is not responding`}>
        {failure.message} Nothing is being shown rather than something out of date — the records
        themselves are unaffected.
      </Alert>
    );
  }

  return (
    <Alert tone="negative" title="This workspace could not be loaded">
      {failure.message}
    </Alert>
  );
}
