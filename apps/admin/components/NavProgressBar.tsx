'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Top-of-page navigation progress bar.
 *
 * The Next.js App Router doesn't expose a "navigation in progress" hook, so
 * we patch `history.pushState` / `replaceState` and listen for `popstate` to
 * detect that a navigation has *started*. We then watch `usePathname` /
 * `useSearchParams` to know when the new route has actually rendered, and
 * complete the bar.
 *
 * Lightweight: ~70 lines, no extra deps.
 */
export default function NavProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Patch history methods once so any router push/replace fires our start
  useEffect(() => {
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;

    function startNow() {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
        completionTimer.current = null;
      }
      setProgress(8);
      // Trickle up to ~80% while we wait for the new route
      if (tickTimer.current) clearInterval(tickTimer.current);
      tickTimer.current = setInterval(() => {
        setProgress((p) => {
          if (p == null) return null;
          if (p >= 80) return p; // park at 80 until route resolves
          const remaining = 80 - p;
          return Math.min(80, p + Math.max(1, remaining * 0.15));
        });
      }, 200);
    }

    // Defer to a macrotask so setState doesn't fire inside React's commit
    // phase. Next.js calls history.pushState synchronously during commit, and
    // microtasks run before yielding to the browser (still inside the commit
    // window), so we use setTimeout(0) which definitely runs afterwards.
    function start() {
      setTimeout(startNow, 0);
    }

    window.history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      start();
      return r;
    };
    window.history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      start();
      return r;
    };
    window.addEventListener('popstate', start);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', start);
      if (tickTimer.current) clearInterval(tickTimer.current);
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, []);

  // When the route key changes (pathname or searchParams), the new page has
  // mounted. Snap to 100%, then fade out.
  useEffect(() => {
    if (progress == null) return;
    if (tickTimer.current) clearInterval(tickTimer.current);
    setProgress(100);
    completionTimer.current = setTimeout(() => setProgress(null), 220);
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (progress == null) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_rgba(22,163,74,0.6)] transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
