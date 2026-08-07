"use client";

import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/utils/trpc";
import { useFlipList } from "./useFlipList";
import { useCountUp } from "./useCountUp";
import { Confetti } from "./Confetti";
import { useDemoTribes } from "./useDemoTribes";

function TribeRow({ tribe, rank, setRef }: { tribe: { name: string; color: string | null; points: number }; rank: number; setRef: (el: HTMLElement | null) => void }) {
  const animatedPoints = useCountUp(tribe.points);
  const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <div
      ref={setRef}
      className="flex items-center justify-between rounded-2xl px-8 py-6 shadow-lg"
      style={{ backgroundColor: tribe.color ?? "#6D4C41" }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl font-black text-white/70 w-12 text-center">{medalEmoji ?? `#${rank}`}</span>
        <span className="text-3xl font-extrabold text-white tracking-wide">{tribe.name}</span>
      </div>
      <span className="text-4xl font-black text-white tabular-nums">{animatedPoints.toLocaleString()}</span>
    </div>
  );
}

export default function PresentationModePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  // Chrome throttles rAF/timer-driven polling on backgrounded/automated
  // tabs, which made the live FLIP reorder + confetti genuinely
  // unverifiable through browser automation (see backlog.md's PR4
  // verification gap). This doesn't touch real data — it's a pure
  // client-side view transform layered on top of (or, with no real data
  // yet, standing in for) the live query below, so one person on one real
  // screen can watch the reorder/confetti fire on demand, permanently.
  const demoMode = searchParams.get("demo") === "1";
  const demoData = useDemoTribes(demoMode);

  const { data: liveData } = api.leaderboard.publicBoard.useQuery({ token }, { refetchInterval: 15_000, retry: false, enabled: !demoMode });
  const data = demoMode ? demoData : liveData;

  const orderedNames = (data?.topTribes ?? []).map((t) => t.name);
  const setNodeRef = useFlipList(orderedNames);

  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const prevChampion = useRef<string | null>(null);

  useEffect(() => {
    const champion = data?.championTribe?.name ?? null;
    if (champion && prevChampion.current && champion !== prevChampion.current) {
      setConfettiTrigger((n) => n + 1);
    }
    prevChampion.current = champion;
  }, [data?.championTribe?.name]);

  if (!data) {
    return <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-neutral-500">Loading…</div>;
  }

  return (
    <div data-testid="presentation-root" className="min-h-screen bg-[#0a0a0a] px-10 py-10">
      <h1 className="mb-8 text-center text-2xl font-bold uppercase tracking-widest text-white/60">{data.campName}</h1>

      <div className="mx-auto max-w-3xl space-y-4">
        {data.topTribes.map((tribe, i) => (
          <TribeRow key={tribe.name} tribe={tribe} rank={i + 1} setRef={setNodeRef(tribe.name)} />
        ))}
      </div>

      {data.lastUpdated && (
        <p className="mt-8 text-center text-xs text-white/30">Last updated {new Date(data.lastUpdated).toLocaleTimeString()}</p>
      )}

      <Confetti color={data.championTribe?.color ?? "#e67e22"} trigger={confettiTrigger} />
    </div>
  );
}
