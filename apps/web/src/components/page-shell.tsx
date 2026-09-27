import type { ReactNode } from 'react';

/**
 * Shared frame for the site's secondary pages, so headings, spacing and
 * measure stay identical across them.
 */
export function PageShell({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      {eyebrow ? (
        <p className="text-brand-600 text-xs font-semibold uppercase tracking-[0.2em]">{eyebrow}</p>
      ) : null}
      <h1 className="font-display text-ink-900 mt-3 text-4xl sm:text-5xl">{title}</h1>
      {lede ? <p className="text-ink-700 mt-5 text-lg leading-relaxed">{lede}</p> : null}
      {children ? <div className="mt-10">{children}</div> : null}
    </div>
  );
}
