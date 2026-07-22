"use client";

import React, { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/cn";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-8 w-8 rounded-md border border-border-default bg-surface" />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-surface text-txt-secondary shadow-xs transition-all hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        className
      )}
      title={isDark ? "Dark mode active (click for light mode)" : "Light mode active (click for dark mode)"}
      aria-label={isDark ? "Dark mode active" : "Light mode active"}
    >
      {isDark ? (
        <MoonIcon className="h-4 w-4 text-accent-400 transition-transform duration-200 hover:-rotate-12" />
      ) : (
        <SunIcon className="h-4 w-4 text-amber-500 transition-transform duration-200 hover:rotate-45" />
      )}
    </button>
  );
}
