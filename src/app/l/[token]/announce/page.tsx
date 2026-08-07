"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/utils/trpc";

const ADVANCE_INTERVAL_MS = 6_000;

/**
 * Wall-display announcement channel — one item at a time, large type,
 * auto-advancing. Driven entirely by `leaderboard.publicAnnouncements`
 * (unauthenticated, token-only, same trust boundary as `/l/[token]`), which
 * itself is built from `toPublicAnnouncementDto`'s own whitelist DTO — see
 * publicDto.ts and publicAnnouncement.test.ts.
 */
export default function AnnouncePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data } = api.leaderboard.publicAnnouncements.useQuery({ token }, { refetchInterval: 30_000, retry: false });

  const [index, setIndex] = useState(0);
  const itemCount = data?.items.length ?? 0;

  useEffect(() => {
    if (itemCount === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % itemCount), ADVANCE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [itemCount]);

  // Keep the visible index in range if the item list shrinks/grows on refetch.
  useEffect(() => {
    if (index >= itemCount) setIndex(0);
  }, [itemCount, index]);

  if (!data) {
    return <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-neutral-500">Loading…</div>;
  }

  const current = data.items[index] ?? null;

  return (
    <div data-testid="announce-root" className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-10 py-10 text-center">
      <h1 className="mb-10 text-lg font-bold uppercase tracking-widest text-white/40">{data.campName}</h1>

      {!current ? (
        <p className="text-2xl text-white/50">No announcements yet — check back once scoring begins.</p>
      ) : (
        <div key={current.id} data-testid="announce-item" className="animate-in fade-in zoom-in-95 duration-500">
          <div className="mb-6 text-8xl">{current.icon}</div>
          <p className="max-w-4xl text-4xl font-extrabold text-white sm:text-5xl">{current.text}</p>
        </div>
      )}

      {itemCount > 1 && (
        <div className="mt-12 flex gap-2">
          {data.items.map((item, i) => (
            <span key={item.id} className={`h-1.5 w-8 rounded-full ${i === index ? "bg-white" : "bg-white/20"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
