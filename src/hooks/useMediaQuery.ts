"use client";

import { useState, useEffect } from "react";

/**
 * SSR-safe media query hook.
 * Syncs with `window.matchMedia` immediately on client mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** True below 768px viewport width — this app's mobile/desktop divide. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
