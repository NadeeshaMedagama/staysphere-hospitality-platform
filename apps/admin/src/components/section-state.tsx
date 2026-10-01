import { ErrorCode } from '@staysphere/contracts';
import { Alert } from '@staysphere/ui';
import type { GatewayResult } from '@staysphere/app-core';

type Failure = Extract<GatewayResult<unknown>, { ok: false }>;

/**
 * Renders a failed read.
 *
 * The distinction this draws is the point of it: "the service is down", "you
 * are not allowed to see this" and "there is nothing here" are three different
 * situations, and a console that renders one message for all three teaches
 * staff to ignore it. Only the first is an incident.
 */
export function SectionFailure({ failure, service }: { failure: Failure; service: string }) {
  if (failure.code === ErrorCode.FORBIDDEN) {
    return (
      <Alert tone="caution" title="Not available to your role">
        Your account does not carry the permission this section requires. A property administrator
        can grant it.
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
    <Alert tone="negative" title="This section could not be loaded">
      {failure.message}
    </Alert>
  );
}

/**
 * Shown where an endpoint to read this data does not exist yet.
 *
 * Deliberately specific about *what* is missing. The console previously told
 * every section that its service was "not yet deployed", which was untrue for
 * all of them and useless for the few where a read API really is absent.
 */
export function NotImplementedYet({
  what,
  detail,
  available,
}: {
  what: string;
  detail: string;
  available?: string;
}) {
  return (
    <div className="rounded-card border-line border border-dashed bg-white p-8">
      <h2 className="text-ink-900 text-sm font-semibold">{what}</h2>
      <p className="text-ink-500 mt-2 max-w-xl text-sm leading-relaxed">{detail}</p>
      {available ? <p className="text-ink-400 mt-4 max-w-xl text-xs">{available}</p> : null}
    </div>
  );
}
