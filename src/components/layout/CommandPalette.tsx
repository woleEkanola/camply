"use client";

import { useEffect, useMemo, useState } from "react";
import { Combobox, Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/api";
import { getNavGroups, type Role } from "./navConfig";

interface PaletteResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

/**
 * Global Cmd+K / Ctrl+K command palette. Indexes (a) the static nav config
 * for instant "jump to page", and (b) a debounced live search against
 * registration.adminList's `q` param — the only tRPC procedure in the app
 * that currently supports server-side search (see plan Step 3: only wire
 * up search that actually exists, don't fabricate new backend search).
 */
export function CommandPalette({ area }: { area: "admin" | "dashboard" | "location-admin" | "super-admin" }) {
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
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const role = session?.user?.role as Role | undefined;
  const organizationId = session?.user?.organizationId ?? "";

  const navResults: PaletteResult[] = useMemo(() => {
    const groups = getNavGroups(role, area);
    return groups.flatMap((g) => g.items.map((item) => ({ id: item.href, label: item.name, sublabel: g.name, href: item.href })));
  }, [role, area]);

  const canSearchRegistrations = area === "admin" && !!organizationId && debouncedQuery.length >= 2;
  const { data: registrationResults } = api.registration.adminList.useQuery(
    { organizationId, q: debouncedQuery, limit: 8 },
    { enabled: canSearchRegistrations }
  );

  const filteredNav = query
    ? navResults.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : navResults;

  const registrationItems: PaletteResult[] = (registrationResults?.items ?? []).map((r: any) => ({
    id: r.id,
    label: r.camperProfile?.name ?? "Registration",
    sublabel: `${r.registrationNumber ?? "No number yet"} · ${r.status}`,
    href: `/admin/registrations?open=${r.id}`,
  }));

  const results = [...filteredNav, ...registrationItems];

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
          <div className="fixed inset-0 bg-neutral-900/40" aria-hidden="true" />
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
            <Dialog.Panel className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
              <Combobox onChange={handleSelect}>
                <div className="flex items-center gap-2 border-b border-neutral-200 px-4">
                  <MagnifyingGlassIcon className="h-4 w-4 text-neutral-400" />
                  <Combobox.Input
                    autoFocus
                    className="w-full border-0 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-0"
                    placeholder="Search pages, registrations..."
                    onChange={(e) => setQuery(e.target.value)}
                    displayValue={() => query}
                  />
                </div>
                {results.length > 0 && (
                  <Combobox.Options static className="max-h-80 overflow-y-auto scrollbar-hide py-2">
                    {results.map((result) => (
                      <Combobox.Option
                        key={result.id}
                        value={result}
                        className={({ active }) =>
                          `flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${active ? "bg-accent-50" : ""}`
                        }
                      >
                        <span className="font-medium text-neutral-800">{result.label}</span>
                        {result.sublabel && <span className="text-xs text-neutral-400">{result.sublabel}</span>}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                )}
                {query && results.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-neutral-400">No results for &quot;{query}&quot;</div>
                )}
              </Combobox>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
