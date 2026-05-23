import type { Config } from 'tailwindcss';
import preset from '@aks/ui/tailwind.preset';

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    // Pick up classes used inside the shared library so Tailwind generates
    // them in this app's bundle.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
