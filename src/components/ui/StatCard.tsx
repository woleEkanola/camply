import { cn } from "@/lib/cn";
import type { BadgeTone } from "./Badge";

const toneAccent: Record<BadgeTone, string> = {
  neutral: "text-neutral-500",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
  info: "text-info-600",
  attention: "text-attention-600",
};

export interface StatCardProps {
  label: string;
  value: string | number;
  /** A short actionable line, e.g. "Registration closes in 3 days" —
   * prefer this over a bare delta/percentage per the dashboard philosophy
   * of surfacing what needs attention, not just a number. */
  insight?: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function StatCard({ label, value, insight, tone = "neutral", icon, onClick, selected, className }: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-lg border bg-white p-4 text-left transition-colors",
        selected ? "border-accent-500 ring-1 ring-accent-500" : "border-neutral-200",
        onClick && "hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 line-clamp-2 break-words leading-tight min-w-0 flex-1 pr-1">{label}</span>
        {icon && <span className={toneAccent[tone]}>{icon}</span>}
      </div>
      <span className="text-2xl font-semibold text-neutral-900">{value}</span>
      {insight && <span className={cn("text-xs", toneAccent[tone])}>{insight}</span>}
    </Comp>
  );
}
