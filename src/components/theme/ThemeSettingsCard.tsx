"use client";

import React from "react";
import { SunIcon, MoonIcon, ComputerDesktopIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTheme, type Theme } from "./ThemeProvider";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface ThemeOption {
  id: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  previewBg: string;
  previewCard: string;
}

const themeOptions: ThemeOption[] = [
  {
    id: "light",
    label: "Light Mode",
    description: "Clean, bright appearance optimized for daylight conditions.",
    icon: SunIcon,
    previewBg: "bg-[#f1f5f9] border-[#cbd5e1]",
    previewCard: "bg-white border-[#cbd5e1]",
  },
  {
    id: "dark",
    label: "Dark Mode",
    description: "Sleek, low-contrast dark interface designed for low light.",
    icon: MoonIcon,
    previewBg: "bg-[#0d0f17] border-[#24283b]",
    previewCard: "bg-[#181b29] border-[#24283b]",
  },
  {
    id: "system",
    label: "System Preference",
    description: "Automatically matches your operating system's theme.",
    icon: ComputerDesktopIcon,
    previewBg: "bg-gradient-to-r from-[#f1f5f9] to-[#0d0f17] border-[#cbd5e1]",
    previewCard: "bg-gradient-to-r from-white to-[#181b29] border-[#cbd5e1]",
  },
];

export function ThemeSettingsCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Appearance & Theme</span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs font-medium text-neutral-500">
          Customize how Camply looks on your device. Your preference will be remembered across sessions.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const isSelected = theme === option.id;
            const Icon = option.icon;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500",
                  isSelected
                    ? "border-accent-500 bg-[var(--color-accent-50)]/20 ring-1 ring-accent-500"
                    : "border-border-default bg-surface hover:border-input-border"
                )}
              >
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-5 w-5", isSelected ? "text-accent-600" : "text-txt-muted")} />
                      <span className="text-sm font-semibold text-txt-primary">
                        {option.label}
                      </span>
                    </div>

                    {isSelected && (
                      <CheckCircleIcon className="h-5 w-5 text-accent-600 shrink-0" />
                    )}
                  </div>

                  <p className="text-xs text-txt-secondary leading-relaxed mb-3">
                    {option.description}
                  </p>
                </div>

                {/* VISUAL PREVIEW MOCKUP */}
                <div className={cn("h-12 w-full rounded-lg border p-1.5 flex gap-1.5 items-center", option.previewBg)}>
                  <div className={cn("h-full w-4 rounded-xs border", option.previewCard)} />
                  <div className="flex-1 space-y-1">
                    <div className={cn("h-2.5 w-full rounded-xs border", option.previewCard)} />
                    <div className={cn("h-2.5 w-2/3 rounded-xs border", option.previewCard)} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
