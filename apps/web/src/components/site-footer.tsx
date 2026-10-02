import Link from 'next/link';

const COLUMNS = [
  {
    heading: 'Stay',
    links: [
      { href: '/rooms', label: 'Rooms & Suites' },
      { href: '/offers', label: 'Special offers' },
      { href: '/amenities', label: 'Amenities' },
    ],
  },
  {
    heading: 'Guests',
    links: [
      { href: '/bookings', label: 'Manage a booking' },
      { href: '/faq', label: 'FAQ' },
      { href: '/contact', label: 'Contact us' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About StaySphere' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-sand-200 mt-24 border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <p className="font-display text-ink-900 text-lg">StaySphere</p>
          <p className="text-ink-500 mt-3 max-w-xs text-sm leading-relaxed">
            A hotel operations and reservation platform — built for guests, run by the people who
            keep the lights on.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className="text-ink-500 text-xs font-semibold uppercase tracking-widest">
              {column.heading}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-ink-700 hover:text-brand-600 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-sand-200 border-t">
        <div className="text-ink-500 mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} StaySphere. All rights reserved.</p>
          <p>Rates shown include taxes and exclude optional extras.</p>
        </div>
      </div>
    </footer>
  );
}
