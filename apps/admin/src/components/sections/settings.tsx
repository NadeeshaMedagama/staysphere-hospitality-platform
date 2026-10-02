import { StatusBadge } from '@staysphere/ui';
import type { Hotel } from '@/lib/hotel';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line flex justify-between gap-6 border-b py-2.5 last:border-0">
      <dt className="text-ink-500 text-sm">{label}</dt>
      <dd className="text-ink-900 text-right text-sm">{value}</dd>
    </div>
  );
}

/** Turns `cancellationPolicyCode` into `Cancellation policy code`. */
function humaniseKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function renderValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '—';
  return String(value);
}

export function SettingsSection({ hotel }: { hotel: Hotel }) {
  const policy = hotel.policy ?? {};

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-card border-line border bg-white p-5">
        <h2 className="text-ink-900 text-sm font-semibold">Property</h2>
        <dl className="mt-3">
          <Row label="Name" value={hotel.name} />
          <Row label="Reference" value={hotel.slug} />
          <Row label="City" value={`${hotel.city}, ${hotel.countryCode}`} />
          <Row label="Address" value={hotel.addressLine1 ?? '—'} />
          <Row label="Timezone" value={hotel.timezone} />
          <Row label="Currency" value={hotel.currency} />
          <Row label="Rating" value={hotel.starRating ? `${hotel.starRating} star` : '—'} />
        </dl>
        <div className="mt-4">
          <StatusBadge status={hotel.status} />
        </div>
      </section>

      <section className="rounded-card border-line border bg-white p-5">
        <h2 className="text-ink-900 text-sm font-semibold">Contact</h2>
        <dl className="mt-3">
          <Row label="Email" value={hotel.email ?? '—'} />
          <Row label="Phone" value={hotel.phone ?? '—'} />
        </dl>
      </section>

      <section className="rounded-card border-line border bg-white p-5 lg:col-span-2">
        <h2 className="text-ink-900 text-sm font-semibold">Policies</h2>
        {Object.keys(policy).length === 0 ? (
          <p className="text-ink-500 mt-2 text-sm">No policies are configured for this property.</p>
        ) : (
          <dl className="mt-3 sm:columns-2 sm:gap-8">
            {Object.entries(policy).map(([key, value]) => (
              <div key={key} className="break-inside-avoid">
                <Row label={humaniseKey(key)} value={renderValue(value)} />
              </div>
            ))}
          </dl>
        )}
        <p className="text-ink-400 mt-4 text-xs">
          Editing is not wired up here: the hotel service accepts changes on{' '}
          <code className="font-mono">PATCH /api/v1/hotels/:id</code>, which needs a form this
          screen does not have yet.
        </p>
      </section>
    </div>
  );
}
