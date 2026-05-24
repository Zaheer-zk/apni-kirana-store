/**
 * @aks/ui — shared shadcn/ui component library for the Apni Kirana Store
 * web apps. Import individual components from subpaths to keep tree-shaking
 * tight (e.g. `import { Button } from '@aks/ui/components/button'`).
 *
 * The barrel below is provided for convenience; prefer subpath imports for
 * anything performance-sensitive.
 */
export * from './lib/utils';
export * from './theme';

export * from './components/button';
export * from './components/input';
export * from './components/label';
export * from './components/card';
export * from './components/dialog';
export * from './components/sheet';
export * from './components/dropdown-menu';
export * from './components/tabs';
export * from './components/badge';
export * from './components/select';
export * from './components/skeleton';
export * from './components/separator';
export * from './components/avatar';
export * from './components/input-otp';
export * from './components/sonner';
export * from './components/location-map';
export * from './components/PwaInstallPrompt';
