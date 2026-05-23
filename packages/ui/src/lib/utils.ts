import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui's canonical class-name helper. Concatenates conditional classes
 * (via `clsx`) then dedupes / overrides Tailwind utilities (via
 * `tailwind-merge`) so that e.g. `cn('p-2', isLarge && 'p-4')` ends up as
 * `'p-4'` rather than `'p-2 p-4'`.
 *
 * Re-exported as `@aks/ui/lib/utils` so apps that copy in additional shadcn
 * components from the upstream CLI continue to work without renaming.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
