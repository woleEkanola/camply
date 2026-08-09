"use client";

import { Tab } from "@headlessui/react";
import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  content: React.ReactNode;
}

export function Tabs({
  tabs,
  className,
  defaultIndex,
  selectedIndex,
  onChange,
}: {
  tabs: TabItem[];
  className?: string;
  defaultIndex?: number;
  /** Controlled mode (e.g. for ?tab= deep links) — pass alongside `onChange`.
   * Headless UI's Tab.Group supports this natively; omit both to keep every
   * other caller's existing uncontrolled behavior unchanged. */
  selectedIndex?: number;
  onChange?: (index: number) => void;
}) {
  return (
    <Tab.Group defaultIndex={defaultIndex} selectedIndex={selectedIndex} onChange={onChange}>
      <Tab.List className={cn("flex gap-1 overflow-x-auto border-b border-neutral-200", className)}>
        {tabs.map((tab) => (
          <Tab
            key={tab.label}
            className={({ selected }) =>
              cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500",
                selected
                  ? "border-accent-600 text-accent-700"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels className="mt-4">
        {tabs.map((tab) => (
          <Tab.Panel key={tab.label} className="focus:outline-none">
            {tab.content}
          </Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  );
}
