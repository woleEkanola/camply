"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";

export interface TrendChartPoint {
  label: string;
  value: number;
}

/**
 * Score-over-time trend line. Centralises what a hand-rolled chart tends to
 * get wrong: an empty series, a single point (no line to draw), and
 * min === max (a flat line that would otherwise render at the very bottom
 * or top edge of the chart depending on the library's default domain).
 */
export function TrendChart({ data, height = 240, color = "#e67e22" }: { data: TrendChartPoint[]; height?: number; color?: string }) {
  if (data.length === 0) {
    return <EmptyState title="No data yet" description="A trend line will appear once there's more than one day of activity." />;
  }
  if (data.length === 1) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-neutral-300 py-8 text-sm text-txt-secondary">
        Only one day of data so far — {data[0].label}: {data[0].value} pts
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // min===max would otherwise collapse Recharts' auto Y-domain to a single
  // value, drawing a flat line pinned to one edge — pad artificially.
  const domain: [number, number] = min === max ? [min - 1, max + 1] : ["auto", "auto"] as any;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default, #e5e5e5)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={domain} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-default, #e5e5e5)" }}
          formatter={(value: unknown) => [`${value} pts`, ""]}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#trendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
