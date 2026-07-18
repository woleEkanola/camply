import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  percent: number;
  className?: string;
}

export function ProgressBar({ percent, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const tone = clamped >= 100 ? "bg-danger-500" : clamped >= 80 ? "bg-warning-500" : "bg-success-500";
  return (
    <div
      className={cn("h-2 w-full rounded-full bg-neutral-100", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-2 rounded-full transition-all", tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
