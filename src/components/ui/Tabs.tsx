"use client";

import { Tab } from "@headlessui/react";
import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  content: React.ReactNode;
}

export function Tabs({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  return (
    <Tab.Group>
      <Tab.List className={cn("flex gap-1 border-b border-neutral-200", className)}>
        {tabs.map((tab) => (
          <Tab
            key={tab.label}
            className={({ selected }) =>
              cn(
                "border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500",
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
