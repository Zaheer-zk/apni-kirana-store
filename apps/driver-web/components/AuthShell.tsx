import { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Centred, max-w-md card used by every driver auth screen. Mirrors
 * `apps/customer-web/components/AuthShell.tsx` so the two surfaces feel
 * like the same product.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>

      {footer ? <div className="mt-6 text-center text-sm text-gray-500">{footer}</div> : null}

      <p className="mt-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Quick Easy Mart · Apni Kirana Store
      </p>
    </main>
  );
}
