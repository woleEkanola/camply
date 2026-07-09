"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  containerClassName?: string;
}

export function SearchBar({ containerClassName, className, placeholder = "Search...", ...props }: SearchBarProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="text"
        placeholder={placeholder}
        className={cn(
          "block w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder-neutral-400",
          "focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500",
          className
        )}
        {...props}
      />
    </div>
  );
}
