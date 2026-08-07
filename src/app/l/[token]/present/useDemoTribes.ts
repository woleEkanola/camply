"use client";

import { useEffect, useState } from "react";

const DEMO_TRIBES = [
  { name: "Judah", color: "#e11d48" },
  { name: "Levi", color: "#2563eb" },
  { name: "Zebulun", color: "#16a34a" },
  { name: "Naphtali", color: "#d97706" },
];

const CYCLE_INTERVAL_MS = 4_000;

type DemoBoard = {
  campName: string;
  championTribe: { name: string; color: string | null; points: number } | null;
  topTribes: { name: string; color: string | null; points: number; rank: number | null }[];
  lastUpdated: string;
};

function randomBoard(seed: number): DemoBoard {
  // Deterministic-ish per tick (not truly random) so the manual verification
  // script can describe "the order changes every few seconds" reliably —
  // simple sine-based jitter per tribe, not Math.random(), so behavior is
  // reproducible across renders within the same tick.
  const scored = DEMO_TRIBES.map((t, i) => ({
    ...t,
    points: Math.round(500 + Math.sin(seed / 3 + i * 2.1) * 400 + i * 37),
  })).sort((a, b) => b.points - a.points);

  const topTribes = scored.map((t, i) => ({ ...t, rank: i + 1 }));
  return {
    campName: "Demo Camp (?demo=1)",
    championTribe: topTribes[0] ?? null,
    topTribes,
    lastUpdated: new Date().toISOString(),
  };
}

/** Never reads or writes real data — purely a client-side simulated view,
 * so `/l/<token>/present?demo=1` is safe to open against any real token
 * without affecting what anyone else sees on the live board. */
export function useDemoTribes(enabled: boolean): DemoBoard | undefined {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return undefined;
  return randomBoard(tick);
}
