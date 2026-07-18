"use client";

import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

export function Dialog({ open, onClose, title, children, footer, size = "md" }: DialogProps) {
  return (
    <Transition show={open} as={Fragment}>
      <HeadlessDialog onClose={onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/40" aria-hidden="true" />
        </Transition.Child>

        {/* Bottom-anchored sheet on mobile (thumb-reachable, no reach to a
            centered box); centered card from `md` up, unchanged from before. */}
        <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-4">
          <Transition.Child
            as={Fragment}
            enter="transition duration-200 ease-out"
            enterFrom="opacity-0 translate-y-full md:translate-y-0 md:scale-95"
            enterTo="opacity-100 translate-y-0 md:scale-100"
            leave="transition duration-150 ease-in"
            leaveFrom="opacity-100 translate-y-0 md:scale-100"
            leaveTo="opacity-0 translate-y-full md:translate-y-0 md:scale-95"
          >
            <HeadlessDialog.Panel
              className={cn(
                "flex max-h-[90vh] w-full flex-col bg-white shadow-lg",
                "rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:max-h-[85vh] md:rounded-lg md:pb-0",
                sizeClasses[size]
              )}
            >
              {/* Grab handle signals the sheet is dismissible/draggable-feeling on mobile; desktop keeps the plain card. */}
              <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300 md:hidden" aria-hidden="true" />
              {title && (
                <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                  <HeadlessDialog.Title className="text-sm font-semibold text-neutral-900">{title}</HeadlessDialog.Title>
                  <button
                    onClick={onClose}
                    className="-mr-1.5 rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
              <div className="overflow-y-auto px-5 py-4">{children}</div>
              {footer && <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4">{footer}</div>}
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
