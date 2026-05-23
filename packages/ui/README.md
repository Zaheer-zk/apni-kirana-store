# @aks/ui — shared UI for the Apni Kirana Store web apps

This workspace holds the shadcn/ui component library, Tailwind preset and brand-token exports that every web app in the monorepo consumes:

- `apps/customer-web` — the customer storefront (quickeasymart.com)
- `apps/store-web` — store-owner portal (store.quickeasymart.com)  *(coming next)*
- `apps/driver-web` — driver portal (driver.quickeasymart.com)  *(coming next)*

The Expo mobile apps continue to use their own React Native components — RN can't import these.

## What's in here

```
packages/ui/
  src/
    components/          shadcn/ui primitives (Button, Input, Dialog, Sheet, …)
    lib/utils.ts         `cn()` — clsx + tailwind-merge
    theme/index.ts       Brand colours, radii, shadows (mirrors apps/customer/constants/theme.ts)
    tailwind.preset.ts   Tailwind preset every web app extends
    styles/globals.css   shadcn CSS variables + tailwind directives
```

## Consuming the package

### 1. Add it to your workspace `package.json`

```json
"dependencies": {
  "@aks/ui": "*"
}
```

`@aks/ui` is a source-only workspace package. Next.js apps must include it in `transpilePackages`:

```ts
// apps/<app>/next.config.ts
const nextConfig: NextConfig = {
  transpilePackages: ['@aks/shared', '@aks/ui'],
};
```

### 2. Extend the Tailwind preset

```ts
// apps/<app>/tailwind.config.ts
import preset from '@aks/ui/tailwind.preset';
import type { Config } from 'tailwindcss';

export default {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Pick up classes used inside the shared library
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
```

### 3. Import the shared stylesheet once

```css
/* apps/<app>/app/globals.css */
@import '@aks/ui/styles.css';
```

That CSS file declares the shadcn HSL variables (`--primary`, `--background`, …) and pulls in the Tailwind directives. Don't redeclare `@tailwind base/components/utilities` in your app.

### 4. Use components

```tsx
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { toast, Toaster } from '@aks/ui/components/sonner';
```

Or via the barrel:

```tsx
import { Button, Card, CardHeader } from '@aks/ui';
```

Prefer the subpath form for new code — bundler tree-shaking is more predictable.

## Adding a new shadcn component

shadcn's CLI generates source files into a project, then you tweak them. We've embraced that workflow but routed the output into `packages/ui/src/components/` so all three apps share a single copy.

```
# from packages/ui
npx shadcn@latest add <component>
```

If the generated file imports from `@/lib/utils` or `@/components/...`, rewrite to relative imports (`../lib/utils`) before committing. Re-export the new component from `src/index.ts`.

## Brand tokens outside Tailwind

Some places can't use Tailwind classes — Leaflet markers, Recharts colours, inline `style` for a third-party widget. Import from the theme directly:

```ts
import { colors } from '@aks/ui/theme';

new L.DivIcon({ html: `<div style="background:${colors.primary}">…` });
```

If you change a colour here, change it in `apps/customer/constants/theme.ts` too so the mobile apps stay in sync.

## Why no per-app theme override?

One brand, three surfaces. Theming the customer storefront differently from the store/driver portals would dilute brand recognition. If we ever need per-app accents we'll extend the preset, not fork it.
