'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Thin top-of-page progress bar that fires on route transitions. No deps —
 * driven by pathname + searchParams change, which Next App Router updates
 * synchronously when navigation begins.
 *
 * Behaviour:
 *   pathname change → bar visible, ramps to 70% over ~300ms
 *   next animation frame after pathname settles → completes to 100% + fades
 */
export default function TopLoader() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    setVisible(true);
    setProgress(20);
    timeouts.current.push(setTimeout(() => setProgress(70), 80));

    // Once the route has rendered (next macrotask after effect runs), finish.
    timeouts.current.push(
      setTimeout(() => {
        setProgress(100);
        timeouts.current.push(
          setTimeout(() => {
            setVisible(false);
            setProgress(0);
          }, 220),
        );
      }, 220),
    );

    return () => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
    };
  }, [pathname, search]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
