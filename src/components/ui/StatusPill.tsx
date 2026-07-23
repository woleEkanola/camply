"use client";

import { cn } from "@/lib/cn";

export type StatusPillTone = "success" | "warning" | "danger" | "info" | "attention" | "brand" | "neutral";

export interface StatusPillProps {
  tone?: StatusPillTone;
  size?: "sm" | "md";
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const toneClasses: Record<StatusPillTone, string> = {
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
  info: "status-info",
  attention: "status-attention",
  brand: "brand-tint",
  neutral: "bg-surface-raised text-txt-secondary",
};

const sizeClasses: Record<"sm" | "md", string> = {
  sm: "px-2 py-0.5 text-[10px] font-bold",
  md: "px-2.5 py-1 text-xs font-semibold",
};

export function StatusPill({ tone = "neutral", size = "sm", dot = false, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full uppercase tracking-wider",
        toneClasses[tone],
        sizeClasses[size],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
      {children}
    </span>
  );
}
