import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Alert, PageHeader, TableSkeleton } from '@staysphere/ui';
import { requireSession } from '@/lib/session';
import { daysBefore, resolveHotel, todayAt } from '@/lib/hotel';
import type { Scope } from '@/lib/data';
import { NotImplementedYet } from '@/components/section-state';
import { AnalyticsSection } from '@/components/sections/analytics';
import { ArrivalsSection } from '@/components/sections/arrivals';
import { AuditSection } from '@/components/sections/audit';
import { HousekeepingSection } from '@/components/sections/housekeeping';
import { InvoicesSection } from '@/components/sections/invoices';
import { MaintenanceSection } from '@/components/sections/maintenance';
import { PaymentsSection } from '@/components/sections/payments';
import { RatesSection } from '@/components/sections/rates';
import { ReportsSection } from '@/components/sections/reports';
import { ReservationsSection } from '@/components/sections/reservations';
import { RoomsSection } from '@/components/sections/rooms';
import { SettingsSection } from '@/components/sections/settings';

/**
 * Console sections.
 *
 * One dynamic route backs every sidebar destination, and the allow-list keeps an
 * unknown path a genuine 404 rather than a friendly-looking empty screen.
 */
const SECTIONS = {
  reservations: {
    title: 'Reservations',
    lede: 'Search, amend and cancel reservations across every property.',
  },
  arrivals: {
    title: 'Arrivals & departures',
    lede: "Today's expected arrivals, in-house guests and pending departures.",
  },
  rooms: {
    title: 'Room board',
    lede: 'Live status for every room, updated as inventory events arrive.',
  },
  housekeeping: {
    title: 'Housekeeping',
    lede: 'Cleaning queue, assignments and inspection sign-off.',
  },
  maintenance: { title: 'Maintenance', lede: 'Engineering tickets by priority, room and assignee.' },
  rates: { title: 'Rates & availability', lede: 'Sellable inventory and the rate plans attached to it.' },
  promotions: { title: 'Promotions', lede: 'Discount codes, long-stay tiers and corporate agreements.' },
  payments: { title: 'Payments', lede: 'Captures, refunds and reconciliation against the folio.' },
  invoices: { title: 'Invoices', lede: 'Guest folios, tax breakdowns and issued invoices.' },
  analytics: { title: 'Analytics', lede: 'Occupancy, ADR, RevPAR and channel mix over time.' },
  reports: { title: 'Reports', lede: 'The daily operating summary for this property.' },
  staff: { title: 'Staff & roles', lede: 'Employee records, role assignment and departmental access.' },
  audit: { title: 'Audit log', lede: 'Who changed what, when, and what the value was before.' },
  settings: { title: 'Settings', lede: 'Property configuration, policies and contact details.' },
} as const;

type SectionKey = keyof typeof SECTIONS;

function resolve(section: string): (typeof SECTIONS)[SectionKey] | null {
  return (SECTIONS as Record<string, (typeof SECTIONS)[SectionKey]>)[section] ?? null;
}

export function generateStaticParams(): Array<{ section: string }> {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: resolve(section)?.title ?? 'Not found' };
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = resolve(section);
  if (!config) notFound();

  const session = await requireSession();
  const hotel = await resolveHotel(session);

  return (
    <div>
      <PageHeader title={config.title} description={config.lede} />
      <div className="mt-6">
        {hotel ? (
          // Each section streams in behind its own boundary, so a slow service
          // delays only its own panel rather than the whole console.
          <Suspense fallback={<TableSkeleton columns={5} />}>
            {renderSection(section as SectionKey, {
              hotelId: hotel.id,
              accessToken: session.accessToken,
            }, hotel.timezone, hotel)}
          </Suspense>
        ) : (
          <Alert tone="negative" title="No property is available">
            The hotel service could not be reached, or this account is not attached to a property.
            Every section is scoped to one, so nothing can be loaded without it.
          </Alert>
        )}
      </div>
    </div>
  );
}

function renderSection(
  section: SectionKey,
  scope: Scope,
  timezone: string,
  hotel: Awaited<ReturnType<typeof resolveHotel>> & object,
) {
  switch (section) {
    case 'reservations':
      return <ReservationsSection scope={scope} />;
    case 'arrivals':
      return <ArrivalsSection scope={scope} today={todayAt(timezone)} />;
    case 'rooms':
      return <RoomsSection scope={scope} />;
    case 'housekeeping':
      return <HousekeepingSection scope={scope} />;
    case 'maintenance':
      return <MaintenanceSection scope={scope} />;
    case 'rates':
      return <RatesSection scope={scope} />;
    case 'payments':
      return <PaymentsSection scope={scope} />;
    case 'invoices':
      return <InvoicesSection scope={scope} />;
    case 'analytics':
      return (
        <AnalyticsSection scope={scope} from={daysBefore(timezone, 30)} to={todayAt(timezone)} />
      );
    case 'reports':
      return <ReportsSection scope={scope} />;
    case 'audit':
      return <AuditSection scope={scope} />;
    case 'settings':
      return <SettingsSection hotel={hotel} />;
    case 'promotions':
      return (
        <NotImplementedYet
          what="No promotions can be listed yet"
          detail="The pricing service can create a promotion and validate a code against a stay, but it has no endpoint that lists the promotions configured for a property — so there is nothing to read here rather than nothing configured."
          available="Available: POST /api/v1/rates/promotions · POST /api/v1/rates/promotions/validate"
        />
      );
    case 'staff':
      return (
        <NotImplementedYet
          what="Staff records cannot be listed yet"
          detail="The auth service owns accounts and roles, but exposes only the signed-in principal — there is no endpoint that lists the people at a property. Roles are assigned directly against the auth database until one exists."
          available="Available: GET /api/v1/auth/me · POST /api/v1/auth/register"
        />
      );
  }
}
