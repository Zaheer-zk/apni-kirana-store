import { cookies } from 'next/headers';

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Reads the user's preferred locale from the `NEXT_LOCALE` cookie.
 * Falls back to English. Safe to call only from Server Components /
 * server-side handlers (uses `next/headers`).
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Lazy-loads the JSON message bundle for the given locale. The dynamic
 * import lets Next code-split each locale into its own chunk so a
 * Hindi-speaking visitor doesn't pay the cost of the English bundle.
 */
export async function getMessages(locale: Locale) {
  switch (locale) {
    case 'hi':
      return (await import('@/messages/hi.json')).default;
    case 'en':
    default:
      return (await import('@/messages/en.json')).default;
  }
}
