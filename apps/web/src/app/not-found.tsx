import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-32 text-center">
      <p className="text-brand-600 text-xs font-semibold uppercase tracking-[0.2em]">Error 404</p>
      <h1 className="font-display text-ink-900 mt-4 text-4xl">We could not find that page</h1>
      <p className="text-ink-500 mt-4">
        The link may be out of date, or the page may have moved. Our rooms are still here.
      </p>
      <Link
        href="/"
        className="bg-brand-600 hover:bg-brand-700 mt-8 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
      >
        Back to the homepage
      </Link>
    </div>
  );
}
