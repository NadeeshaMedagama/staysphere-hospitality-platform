import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-ink-400 text-xs font-semibold uppercase tracking-widest">Error 404</p>
      <h1 className="text-ink-900 mt-3 text-xl font-semibold">Screen not found</h1>
      <p className="text-ink-500 mt-2 text-sm">
        This console section does not exist, or your role does not have access to it.
      </p>
      <Link
        href="/"
        className="bg-brand-600 hover:bg-brand-700 mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
      >
        Back to overview
      </Link>
    </div>
  );
}
