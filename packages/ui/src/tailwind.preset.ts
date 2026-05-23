/**
 * Shared Tailwind preset for all `@aks` web apps (customer-web, store-web,
 * driver-web). Each app extends this preset in its own `tailwind.config.ts`
 * and provides its own `content` globs.
 *
 * Usage:
 *   // apps/<app>/tailwind.config.ts
 *   import preset from '@aks/ui/tailwind.preset';
 *   export default {
 *     presets: [preset],
 *     content: ['./app/<dot><dot>'<dot><dot>'.{ts,tsx}', './components/<dot><dot>/'<dot>.{ts,tsx}'],
 *   } satisfies Config;
 *
 * NOTE: shadcn/ui components rely on the CSS variables defined in
 * `src/styles/globals.css` (--background, --primary, etc.). Every web app
 * must import that stylesheet from its root layout.
 */
import type { Config } from 'tailwindcss';
// tailwindcss-animate is a runtime plugin; types are loose so we keep this
// as a default-import without trying to coerce a Plugin type.
import animate from 'tailwindcss-animate';
import { colors as brand } from './theme';

const preset: Partial<Config> = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        // shadcn semantic tokens — backed by CSS variables in globals.css.
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: brand.primary,
          foreground: brand.white,
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: brand.primary,
          700: brand.primaryDark,
          800: '#166534',
          900: '#14532D',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: brand.error,
          foreground: brand.white,
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: brand.accent,
          foreground: brand.white,
          light: brand.accentLight,
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Raw brand palette in case a consumer needs the exact tokens.
        brand: brand,
        success: brand.success,
        warning: brand.warning,
        error: brand.error,
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'Open Sans',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [animate],
};

export default preset;
