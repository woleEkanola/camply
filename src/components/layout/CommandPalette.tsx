"use client";

import { useEffect, useMemo, useState } from "react";
import { Combobox, Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { getNavGroups, type Role } from "./navConfig";

interface PaletteResult {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  href: string;
}

/**
 * Global Cmd+K / Ctrl+K command palette.
 * Indexes (a) static nav config for page navigation, and
 * (b) multi-entity global search across Campers, Registrations, Staff, and Campuses.
 */
export function CommandPalette({ area }: { area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const role = session?.user?.role as Role | undefined;
  const organizationId = session?.user?.organizationId ?? "";

  const navResults: PaletteResult[] = useMemo(() => {
    const groups = getNavGroups(role, area);
    return groups.flatMap((g) =>
      g.items.map((item) => ({
        id: `nav-${item.href}`,
        label: item.name,
        sublabel: g.name,
        badge: "Page",
        href: item.href,
      }))
    );
  }, [role, area]);

  const canSearchGlobal = debouncedQuery.length >= 1;
  const { data: globalResults, isLoading } = api.search.global.useQuery(
    { query: debouncedQuery, organizationId, limit: 5 },
    { enabled: canSearchGlobal }
  );

  const filteredNav = query
    ? navResults.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : navResults;

  const entityResults: PaletteResult[] = (globalResults ?? []).map((item) => ({
    id: item.id,
    label: item.title,
    sublabel: item.subtitle,
    badge: item.badge,
    href: item.href,
  }));

  const results = [...filteredNav, ...entityResults];

  const handleSelect = (result: PaletteResult | null) => {
    if (!result) return;
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  return (
    <Transition show={open} as={Fragment} afterLeave={() => setQuery("")}>
      <Dialog onClose={() => setOpen(false)} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-start justify-center p-4 pt-[15vh]">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
              <Combobox onChange={handleSelect}>
                <div className="flex items-center gap-2 border-b border-neutral-200 px-4">
                  <MagnifyingGlassIcon className="h-5 w-5 text-neutral-400" />
                  <Combobox.Input
                    autoFocus
                    className="w-full border-0 py-3.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-0"
                    placeholder="Search campers, registrations, staff, pages..."
                    onChange={(e) => setQuery(e.target.value)}
                    displayValue={() => query}
                  />
                  {isLoading && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
                  )}
                </div>
                {results.length > 0 && (
                  <Combobox.Options static className="max-h-80 overflow-y-auto scrollbar-hide py-2">
                    {results.map((result) => (
                      <Combobox.Option
                        key={result.id}
                        value={result}
                        className={({ active }) =>
                          `flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm ${
                            active ? "bg-accent-50 text-accent-900" : "text-neutral-700"
                          }`
                        }
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="font-medium text-neutral-900 truncate">{result.label}</span>
                          {result.sublabel && (
                            <span className="text-xs text-neutral-400 truncate">{result.sublabel}</span>
                          )}
                        </div>
                        {result.badge && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              result.badge === "Camper"
                                ? "bg-primary-100 text-primary-700"
                                : result.badge === "Registration"
                                ? "bg-accent-100 text-accent-700"
                                : result.badge === "Staff"
                                ? "bg-success-100 text-success-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {result.badge}
                          </span>
                        )}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                )}
                {query && results.length === 0 && !isLoading && (
                  <div className="px-4 py-8 text-center text-sm text-neutral-500">
                    No results found for &quot;{query}&quot;
                  </div>
                )}
              </Combobox>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
