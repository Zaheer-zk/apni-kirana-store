'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Re-export Sonner's `<Toaster />` and `toast()` helper so apps can drop in
 * `<Toaster richColors closeButton position="top-center" />` from a single
 * shared import.
 *
 * Why Sonner over the legacy shadcn `<Toast>`: tiny (~3 kB), keyboard-
 * friendly, animation is built-in, and the shadcn docs themselves recommend
 * it for Next.js App Router projects.
 */
export const Toaster = SonnerToaster;
export { toast };
