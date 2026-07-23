"use client";

import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import type { StatusPillTone } from "./StatusPill";

export interface AlertProps {
  tone?: StatusPillTone;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneClass: Record<StatusPillTone, string> = {
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
  info: "status-info",
  attention: "status-attention",
  brand: "brand-tint",
  neutral: "bg-surface-raised text-txt-secondary",
};

const toneIcon: Record<StatusPillTone, { Icon: typeof CheckCircleIcon; className: string }> = {
  success: { Icon: CheckCircleIcon, className: "icon-success" },
  warning: { Icon: ExclamationTriangleIcon, className: "icon-warning" },
  danger: { Icon: XCircleIcon, className: "icon-danger" },
  info: { Icon: InformationCircleIcon, className: "icon-info" },
  attention: { Icon: InformationCircleIcon, className: "icon-attention" },
  brand: { Icon: InformationCircleIcon, className: "icon-brand" },
  neutral: { Icon: InformationCircleIcon, className: "icon-neutral" },
};

export function Alert({ tone = "info", title, children, onDismiss, className }: AlertProps) {
  const { Icon, className: iconCls } = toneIcon[tone];
  return (
    <div className={cn("rounded-md border p-3 flex items-start gap-2.5 text-sm", toneClass[tone], className)}>
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconCls)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="opacity-90">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Dismiss"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
