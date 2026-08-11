import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  percent: number;
  className?: string;
  /** Default ("capacity") derives tone from percent: high = full/overbooked,
   * so it renders amber/rose as percent climbs — correct for room/venue
   * capacity, wrong for a metric where high is good (e.g. 95% attendance
   * would otherwise render as a warning). Pass "achievement" to invert that:
   * high percent renders emerald, low renders rose. */
  tone?: "capacity" | "achievement";
}

export function ProgressBar({ percent, className, tone = "capacity" }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const barColor =
    tone === "achievement"
      ? clamped >= 80
        ? "bg-emerald-500"
        : clamped >= 50
          ? "bg-amber-500"
          : "bg-rose-500"
      : clamped >= 100
        ? "bg-rose-500"
        : clamped >= 80
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div
      className={cn("h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
