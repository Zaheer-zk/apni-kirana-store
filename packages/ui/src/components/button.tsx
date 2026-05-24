'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * shadcn-style Button. Variants mirror upstream
 * (https://ui.shadcn.com/docs/components/button) so the muscle-memory
 * snippets shadcn's CLI generates keep working.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-700 active:bg-primary-800',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-red-700',
        outline:
          'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-gray-200',
        ghost: 'hover:bg-gray-100 text-gray-700',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-12 px-6 rounded-lg text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as a child element (e.g. Next.js `<Link>`) using Radix `Slot`. */
  asChild?: boolean;
  /** Show a spinner and disable the button. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    // Radix Slot uses React.Children.only — passing the loader + children
    // array (even with a null loader slot) throws. When `asChild` is set,
    // forward the child as-is and skip the loader UI (callers using
    // asChild are wrapping <Link>/etc., which doesn't need a spinner).
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
