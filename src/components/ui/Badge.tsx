import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "attention";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-txt-secondary border border-border-default",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  attention: "bg-[var(--status-attention-bg)] text-[var(--status-attention-fg)]",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function Badge({ tone = "neutral", children, className, "data-testid": dataTestId }: BadgeProps) {
  return (
    <span
      data-testid={dataTestId}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
