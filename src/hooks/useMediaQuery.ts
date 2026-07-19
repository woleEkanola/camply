"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query hook. `getServerSnapshot` returns `false` (assume
 * desktop) so the server-rendered and first-client-render markup match —
 * `useSyncExternalStore` then lets React re-render after commit once the
 * real `matchMedia` result is known, without a hydration-mismatch warning.
 *
 * Prefer CSS breakpoints (`md:` etc.) for layout — reach for this hook only
 * when behavior itself must branch in JS (e.g. camera `facingMode`, gating
 * a gesture handler) and a pure CSS toggle can't express it.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True below Tailwind's `md` breakpoint (768px) — this app's mobile/desktop divide. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
