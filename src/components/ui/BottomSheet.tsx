"use client";

import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  snap?: "auto" | "full";
}

/**
 * Slides up from the bottom on mobile, centers as a dialog at `md` and up.
 * Built on Headless UI Dialog (focus trap + Escape + scroll lock) — the
 * scan overlays this replaces were hand-rolled `fixed inset-0` divs with
 * none of that, dismissed by a click anywhere on the backdrop.
 */
export function BottomSheet({ open, onClose, title, children, footer, snap = "auto" }: BottomSheetProps) {
  return (
    <Transition show={open} as={Fragment}>
      <HeadlessDialog onClose={onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/50" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-4">
          <Transition.Child
            as={Fragment}
            enter="transition duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)]"
            enterFrom="opacity-0 translate-y-full md:translate-y-4 md:scale-95"
            enterTo="opacity-100 translate-y-0 md:scale-100"
            leave="transition duration-200 ease-in"
            leaveFrom="opacity-100 translate-y-0 md:scale-100"
            leaveTo="opacity-0 translate-y-full md:translate-y-4 md:scale-95"
          >
            <HeadlessDialog.Panel
              data-testid="bottom-sheet-panel"
              className={cn(
                "flex w-full flex-col bg-elevated text-txt-primary border border-elevated-border shadow-2xl",
                "rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-2xl md:pb-0",
                snap === "full" ? "h-[85vh] md:h-auto md:max-h-[85vh]" : "max-h-[80vh]"
              )}
            >
              <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-default md:hidden" aria-hidden="true" />
              {title && (
                <div className="flex items-center justify-between border-b border-elevated-border px-5 py-4">
                  <HeadlessDialog.Title className="text-sm font-semibold text-txt-primary">{title}</HeadlessDialog.Title>
                  <button
                    onClick={onClose}
                    className="-mr-1.5 rounded-md p-2 text-txt-muted hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
              <div className="overflow-y-auto px-5 py-4">{children}</div>
              {footer && <div className="flex justify-end gap-2 border-t border-elevated-border px-5 py-4">{footer}</div>}
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
