"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

/** Score distribution / category performance bars. Empty data and
 * arbitrary/missing per-bar colours (falls back to the brand accent) are
 * the two things a hand-rolled version tends to get wrong. */
export function BarChartWrapper({ data, height = 240, defaultColor = "#e67e22" }: { data: BarChartDatum[]; height?: number; defaultColor?: string }) {
  if (data.length === 0) {
    return <EmptyState title="No data yet" description="Bars will appear once there's scored activity to compare." />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default, #e5e5e5)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-default, #e5e5e5)" }}
          formatter={(value: unknown) => [`${value} pts`, ""]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={isValidCssColor(d.color) ? d.color! : defaultColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function isValidCssColor(color: string | undefined): boolean {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color);
}
