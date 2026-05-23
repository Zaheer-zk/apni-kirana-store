import { ShoppingBasket } from 'lucide-react';
import { cn } from '@aks/ui/lib/utils';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  /** Show the wordmark beside the icon. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * The Quick Easy Mart brand mark — a basket icon in a green tile, optionally
 * with the wordmark to the right. Mirrors the basket lockup used on the
 * mobile app and admin login page.
 */
export function BrandMark({ size = 'md', withWordmark = false, className }: BrandMarkProps) {
  const tileClass = {
    sm: 'h-9 w-9 rounded-lg',
    md: 'h-12 w-12 rounded-xl',
    lg: 'h-14 w-14 rounded-2xl',
  }[size];

  const iconClass = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
  }[size];

  const labelClass = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  }[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center justify-center bg-primary shadow-md shadow-primary/30',
          tileClass,
        )}
      >
        <ShoppingBasket className={cn('text-white', iconClass)} aria-hidden />
      </div>
      {withWordmark ? (
        <span className={cn('font-bold tracking-tight text-gray-900', labelClass)}>
          Quick Easy Mart
        </span>
      ) : null}
    </div>
  );
}
