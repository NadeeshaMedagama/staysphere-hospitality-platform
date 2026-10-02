'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@staysphere/ui';

const SECTIONS = [
  {
    heading: null,
    items: [{ href: '/', label: 'Overview' }],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/reservations', label: 'Reservations' },
      { href: '/arrivals', label: 'Arrivals & departures' },
      { href: '/rooms', label: 'Room board' },
      { href: '/housekeeping', label: 'Housekeeping' },
      { href: '/maintenance', label: 'Maintenance' },
    ],
  },
  {
    heading: 'Commercial',
    items: [
      { href: '/rates', label: 'Rates & availability' },
      { href: '/promotions', label: 'Promotions' },
      { href: '/payments', label: 'Payments' },
      { href: '/invoices', label: 'Invoices' },
    ],
  },
  {
    heading: 'Insight',
    items: [
      { href: '/analytics', label: 'Analytics' },
      { href: '/reports', label: 'Reports' },
    ],
  },
  {
    heading: 'System',
    items: [
      { href: '/staff', label: 'Staff & roles' },
      { href: '/audit', label: 'Audit log' },
      { href: '/settings', label: 'Settings' },
    ],
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-line hidden w-60 shrink-0 border-r bg-white lg:block">
      <div className="border-line flex h-14 items-center gap-2.5 border-b px-5">
        <span
          aria-hidden
          className="bg-brand-600 grid size-7 place-items-center rounded-md text-sm font-semibold text-white"
        >
          S
        </span>
        <div className="leading-tight">
          <p className="text-ink-900 text-sm font-semibold">StaySphere</p>
          <p className="text-ink-400 text-[0.6875rem]">Operations</p>
        </div>
      </div>

      <nav aria-label="Console sections" className="space-y-6 px-3 py-5">
        {SECTIONS.map((section, index) => (
          <div key={section.heading ?? `section-${index}`}>
            {section.heading ? (
              <h2 className="text-ink-400 px-2 pb-2 text-[0.6875rem] font-semibold uppercase tracking-widest">
                {section.heading}
              </h2>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-brand-50 text-brand-700 font-medium'
                          : 'text-ink-700 hover:bg-slate-25 hover:text-ink-900',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
