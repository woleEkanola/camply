"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";

export interface BumpSeries {
  id: string;
  name: string;
  color: string;
  /** rank per day, aligned to the shared `days` array (same index) — null
   * for a day the subject had no rank yet (e.g. joined later). */
  ranks: (number | null)[];
}

/** Rank movement over time — lower rank (1st place) renders at the top,
 * via an inverted Y axis. Each subject is one line, coloured by its own
 * tribe/subject colour rather than a generic categorical palette, so it
 * reads as "this tribe's line" at a glance. */
export function BumpChart({ days, series, height = 260 }: { days: string[]; series: BumpSeries[]; height?: number }) {
  if (days.length === 0 || series.length === 0) {
    return <EmptyState title="No rank history yet" description="Rank movement appears once a few days of scoring have happened." />;
  }

  const data = days.map((day, i) => {
    const row: Record<string, number | string | null> = { day };
    for (const s of series) row[s.id] = s.ranks[i] ?? null;
    return row;
  });

  const maxRank = Math.max(1, ...series.flatMap((s) => s.ranks.filter((r): r is number => r != null)));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default, #e5e5e5)" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          reversed
          domain={[1, maxRank]}
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={28}
          label={{ value: "Rank", angle: -90, position: "insideLeft", fontSize: 11 }}
        />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-default, #e5e5e5)" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
