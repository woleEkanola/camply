import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  percent: number;
  className?: string;
}

export function ProgressBar({ percent, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const tone = clamped >= 100 ? "bg-rose-500" : clamped >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div
      className={cn("h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
