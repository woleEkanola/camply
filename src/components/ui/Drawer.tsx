"use client";

import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: "md" | "lg" | "xl";
}

const widthClasses = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" };

/**
 * Right-side slide-over used for detail/review workflows (e.g. reviewing a
 * registration) so admins stay in context instead of navigating to a
 * separate detail page. Generalized from the RegistrationDrawer pattern
 * that used to be defined locally inside admin/registrations/page.tsx.
 */
export function Drawer({ open, onClose, title, subtitle, children, width = "lg" }: DrawerProps) {
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
          <div className="fixed inset-0 bg-neutral-900/40" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 flex justify-end">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <HeadlessDialog.Panel className={cn("h-full w-full overflow-y-auto bg-surface shadow-xl scrollbar-hide", widthClasses[width])}>
              {(title || subtitle) && (
                <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border-default bg-surface px-6 py-4">
                  <div>
                    {title && <HeadlessDialog.Title className="text-base font-semibold text-txt-primary">{title}</HeadlessDialog.Title>}
                    {subtitle && <div className="mt-0.5 text-sm text-txt-secondary">{subtitle}</div>}
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-md p-1.5 text-txt-muted hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
              <div className="px-6 py-5">{children}</div>
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
