"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Transition } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "danger" | "warning" | "info";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: typeof CheckCircleIcon; className: string; iconClassName: string }> = {
  success: { icon: CheckCircleIcon, className: "status-success", iconClassName: "icon-success" },
  danger: { icon: XCircleIcon, className: "status-danger", iconClassName: "icon-danger" },
  warning: { icon: ExclamationTriangleIcon, className: "status-warning", iconClassName: "icon-warning" },
  info: { icon: InformationCircleIcon, className: "status-info", iconClassName: "icon-info" },
};

const AUTO_DISMISS_MS = 4000;

/**
 * Dependency-free toast system (matches this repo's "custom on Headless UI"
 * primitives rather than pulling in sonner/react-hot-toast). Mount once at
 * the app root (see layout.tsx) and call `useToast()` from anywhere below
 * it. Positioned bottom-center on mobile — clears the fixed BottomNav and
 * respects the safe-area inset — and top-right on desktop.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("danger", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:items-end md:px-0"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { icon: Icon, className, iconClassName } = TONE_STYLES[t.tone];
          return (
            <Transition
              key={t.id}
              appear
              show
              enter="transition duration-200 ease-out"
              enterFrom="opacity-0 translate-y-2 md:translate-y-0 md:translate-x-2"
              enterTo="opacity-100 translate-y-0 md:translate-x-0"
              leave="transition duration-150 ease-in"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-current/15 px-4 py-3 text-sm shadow-lg dark:shadow-2xl",
                  className
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", iconClassName)} aria-hidden="true" />
                <p className="flex-1">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="-m-1 shrink-0 rounded-md p-1 text-current opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  aria-label="Dismiss"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </Transition>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
