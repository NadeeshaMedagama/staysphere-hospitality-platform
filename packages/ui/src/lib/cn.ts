import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind conflicts.
 *
 * Without the merge step, a caller passing `className="p-6"` to a component
 * whose default is `p-4` would get both, and the winner would depend on
 * stylesheet order rather than intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
