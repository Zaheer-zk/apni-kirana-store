'use client';

import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { toast } from '@aks/ui/components/sonner';
import { useFavoriteIds, useToggleFavorite } from '@/lib/favorites';

/**
 * Heart toggle for a catalog product. Reads the shared favorited-id set so
 * every card on a page shares one fetch. Logged-out taps bounce to /login.
 * Stops click propagation so it can sit on top of a card that links elsewhere.
 */
export function FavoriteButton({
  catalogItemId,
  name,
  className = '',
  size = 'md',
}: {
  catalogItemId: string;
  name?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const { ids, isLoggedIn } = useFavoriteIds();
  const toggle = useToggleFavorite();
  const active = ids.has(catalogItemId);
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      router.push('/login?next=' + encodeURIComponent(window.location.pathname));
      return;
    }
    const next = !active;
    toggle.mutate(
      { catalogItemId, next },
      {
        onSuccess: () =>
          toast.success(
            next
              ? `${name ?? 'Item'} added to favorites`
              : `${name ?? 'Item'} removed from favorites`,
          ),
        onError: () => toast.error('Could not update favorites'),
      },
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      className={`inline-flex items-center justify-center rounded-full transition active:scale-90 ${className}`}
    >
      <Heart
        className={`${dim} transition-colors ${
          active ? 'fill-rose-500 text-rose-500' : 'text-gray-400 hover:text-rose-500'
        }`}
      />
    </button>
  );
}
