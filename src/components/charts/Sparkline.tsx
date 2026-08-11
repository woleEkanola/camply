"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

/** Tiny inline trend indicator for a StatCard/table cell — no axes, no
 * tooltip, no grid. Renders nothing (not an empty chart frame) below 2
 * points, since a single-point "trend" is meaningless and Recharts would
 * otherwise just draw a dot. */
export function Sparkline({ values, color = "#e67e22", width = 80, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const data = values.map((value, i) => ({ i, value }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
