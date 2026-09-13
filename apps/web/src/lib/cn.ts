import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind conflicts, so a caller
 * can override a component's default utility without specificity games.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
