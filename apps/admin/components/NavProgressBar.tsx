'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Top-of-page navigation progress bar.
 *
 * Watches `usePathname` / `useSearchParams` for changes — when either
 * flips, the new route has just rendered, so we mount a CSS-driven
 * 0→100% sweep + fade animation (`.nav-progress` keyframe in globals.css).
 * The bar unmounts itself once the animation finishes.
 *
 * We use `key` to force a fresh DOM node on every navigation so the
 * animation restarts even if the user clicks rapidly between routes.
 */
export default function NavProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const isFirstRender = useRef(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip initial page load — only fire on subsequent navigations
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTick((t) => t + 1);
    setVisible(true);
    // Animation runs for 600ms; unmount slightly after to avoid flicker
    hideTimer.current = setTimeout(() => setVisible(false), 650);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-0.5"
    >
      <div
        key={tick}
        className="nav-progress h-full bg-primary shadow-[0_0_10px_rgba(22,163,74,0.7)]"
      />
    </div>
  );
}
