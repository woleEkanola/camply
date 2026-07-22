import { cn } from "@/lib/cn";
import type { BadgeTone } from "./Badge";

const toneIconBg: Record<BadgeTone, string> = {
  neutral: "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  danger: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  attention: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
};

const toneAccent: Record<BadgeTone, string> = {
  neutral: "text-neutral-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
  info: "text-blue-400",
  attention: "text-purple-400",
};

export interface StatCardProps {
  label: string;
  value: string | number;
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
        "flex flex-col justify-between rounded-xl border bg-surface p-4 text-left transition-all duration-150 shadow-xs min-h-[96px] group",
        selected
          ? "border-accent-500 ring-1 ring-accent-500 bg-accent-500/5 dark:bg-accent-500/10"
          : "border-border-default hover:border-neutral-700 hover:bg-surface-hover",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-txt-secondary truncate">{label}</span>
          <span className="block text-2xl md:text-3xl font-extrabold text-txt-primary tracking-tight mt-1">{value}</span>
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105", toneIconBg[tone])}>
            {icon}
          </div>
        )}
      </div>
      {insight && <span className={cn("mt-2 text-xs font-medium truncate", toneAccent[tone])}>{insight}</span>}
    </Comp>
  );
}
