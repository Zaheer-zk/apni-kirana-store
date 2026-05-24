'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { useTransition } from 'react';

/**
 * Tiny EN ↔ हि toggle. Persists choice in the `NEXT_LOCALE` cookie (1-yr,
 * SameSite=Lax) and triggers `router.refresh()` so server components
 * re-render with the new message bundle. Mount this once in the app
 * header next to the profile menu.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('locale');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next = locale === 'en' ? 'hi' : 'en';
  const label = t('toggle');
  const aria = t('toggleAria');

  function handleClick() {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${oneYear}; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={aria}
      title={aria}
      className={
        className ??
        'inline-flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-primary-200 hover:text-primary disabled:opacity-60'
      }
    >
      <Globe className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
