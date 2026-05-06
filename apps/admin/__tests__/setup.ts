/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import React from 'react';

// next/navigation mocks
jest.mock('next/navigation', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };
  return {
    useRouter: () => router,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: jest.fn(),
    notFound: jest.fn(),
  };
});

// next/link – render as a plain anchor
jest.mock('next/link', () => {
  const Link = ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children);
  return { __esModule: true, default: Link };
});

// lucide-react – stub all icons as a span
jest.mock('lucide-react', () => {
  return new Proxy(
    {},
    {
      get: () =>
        ({ className }: any) =>
          React.createElement('span', { className, 'data-testid': 'icon' }),
    }
  );
});

// axios mock
jest.mock('axios', () => {
  const mockResponse = { data: { success: true, data: [] } };
  const instance: any = {
    get: jest.fn(async () => mockResponse),
    post: jest.fn(async () => mockResponse),
    put: jest.fn(async () => mockResponse),
    patch: jest.fn(async () => mockResponse),
    delete: jest.fn(async () => mockResponse),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return {
    __esModule: true,
    default: { ...instance, create: jest.fn(() => instance), isAxiosError: () => false },
    create: jest.fn(() => instance),
    isAxiosError: () => false,
  };
});

// recharts – mock to avoid layout/dom complexity
jest.mock('recharts', () => {
  const Mock = ({ children }: any) => React.createElement('div', null, children);
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === '__esModule') return true;
        return Mock;
      },
    }
  );
});

// localStorage mock
const storage: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k]);
    },
    key: (i: number) => Object.keys(storage)[i] ?? null,
    get length() {
      return Object.keys(storage).length;
    },
  },
  writable: true,
});

// matchMedia (Recharts/Next sometimes use it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

// Silence noisy warnings
const origError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0]?.toString?.() ?? '';
  if (msg.includes('not wrapped in act')) return;
  origError(...args);
};
