"use client";

import type { StatTile } from "@/lib/stationStats";

export function StationStatTiles({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map((tile) => (
        <div key={tile.key} className="rounded-lg bg-white/10 px-2 py-1.5 text-center backdrop-blur-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/70">{tile.label}</span>
          <span className="block text-xl font-black text-white leading-tight">{tile.value}</span>
        </div>
      ))}
    </div>
  );
}
