"use client";

import { useEffect, useState, useDeferredValue } from "react";
import { api } from "@/utils/trpc";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  IdentificationIcon,
} from "@heroicons/react/24/outline";
import { offline } from "@/lib/offlineEngine";
import { OfflineCamper } from "@/lib/offlineDb";

interface CamperSearchResult {
  registrationId: string;
  registrationNumber?: string | null;
  qrToken?: string | null;
  name: string;
  gender?: string | null;
  photoUrl?: string | null;
  campusName?: string | null;
  tribeName?: string | null;
  hostelName?: string | null;
  roomName?: string | null;
  bedLabel?: string | null;
  phone?: string | null;
  status?: string | null;
}

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  onSelectCamper?: (camper: CamperSearchResult) => void;
  organizationId?: string;
}

/**
 * Top-anchored full-coverage Search Sheet for QR Scanner fallback.
 * Covers the camera viewport so mobile keyboards never block live results.
 * Combines instant offline IndexedDB index searches with debounced server API lookups.
 */
export function SearchSheet({
  open,
  onClose,
  onSearch,
  onSelectCamper,
  organizationId,
}: SearchSheetProps) {
  const [value, setValue] = useState("");
  const [offlineResults, setOfflineResults] = useState<CamperSearchResult[]>([]);
  const deferredValue = useDeferredValue(value);

  // Debounced search query for server API
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  // Server-side live search query when online
  const { data: serverResults, isFetching: isSearchingServer } = api.scan.searchCampers.useQuery(
    {
      organizationId: organizationId || "",
      query: debouncedQuery,
      limit: 15,
    },
    {
      enabled: open && !!organizationId && debouncedQuery.length >= 2,
      staleTime: 10000,
    }
  );

  // Offline IndexedDB search as user types
  useEffect(() => {
    const q = deferredValue.trim();
    if (!q) {
      setOfflineResults([]);
      return;
    }

    let active = true;
    offline.search(q, 10).then((results: OfflineCamper[]) => {
      if (active) {
        setOfflineResults(
          results.map((c) => ({
            registrationId: c.registrationId,
            registrationNumber: c.registrationNumber,
            qrToken: c.qrToken,
            name: c.name,
            gender: c.gender,
            photoUrl: c.photoUrl,
            tribeName: c.tribeName,
            hostelName: c.hostelName,
            roomName: c.roomName,
            bedLabel: c.bedLabel,
            phone: c.teenPhone || c.parentPhone,
          }))
        );
      }
    });

    return () => {
      active = false;
    };
  }, [deferredValue]);

  // Combine server and offline results without duplicates
  const mergedResults: CamperSearchResult[] = (() => {
    const seen = new Set<string>();
    const list: CamperSearchResult[] = [];

    // Prioritize server results when available (more fresh/rich)
    for (const item of serverResults || []) {
      if (!seen.has(item.registrationId)) {
        seen.add(item.registrationId);
        list.push(item);
      }
    }

    // Add offline results that aren't already included
    for (const item of offlineResults) {
      if (!seen.has(item.registrationId)) {
        seen.add(item.registrationId);
        list.push(item);
      }
    }

    return list;
  })();

  if (!open) return null;

  const handleSelect = (camper: CamperSearchResult) => {
    if (onSelectCamper) {
      onSelectCamper(camper);
    } else {
      onSearch(camper.registrationNumber || camper.qrToken || camper.name);
    }
    setValue("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = value.trim();
    if (!clean) return;

    if (mergedResults.length === 1) {
      handleSelect(mergedResults[0]);
    } else {
      onSearch(clean);
      setValue("");
      onClose();
    }
  };

  return (
    <div
      data-search-overlay
      className="fixed inset-0 z-50 flex flex-col bg-bg-surface backdrop-blur-md animate-fade-in md:p-6 md:bg-neutral-900/60 md:flex md:items-center md:justify-center"
    >
      <div className="flex flex-col h-full w-full bg-bg-surface md:h-auto md:max-h-[85vh] md:max-w-xl md:rounded-2xl md:shadow-2xl md:border md:border-border-default overflow-hidden">
        {/* Header covering the top / camera viewport */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <MagnifyingGlassIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-base font-bold text-txt-primary">Search Camper Database</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-txt-muted hover:bg-bg-subtle hover:text-txt-primary transition cursor-pointer"
            aria-label="Close search"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Pinned Search Input at the top */}
        <div className="p-4 border-b border-border-default bg-bg-subtle/50">
          <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-txt-muted pointer-events-none" />
              <Input
                autoFocus
                className="pl-11 pr-10 h-12 text-base rounded-xl bg-bg-surface border-border-default focus:border-accent-500 shadow-sm"
                placeholder="Name, registration #, or phone..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {value && (
                <button
                  type="button"
                  onClick={() => setValue("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-txt-muted hover:text-txt-primary cursor-pointer"
                  aria-label="Clear input"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              className="h-12 px-5 font-bold shrink-0 rounded-xl cursor-pointer"
              disabled={!value.trim()}
            >
              Search
            </Button>
          </form>
        </div>

        {/* Live Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 divide-y divide-border-subtle">
          {mergedResults.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs font-semibold text-txt-muted">
                <span>Matching Campers ({mergedResults.length})</span>
                {isSearchingServer && <span className="animate-pulse text-accent-600">Searching...</span>}
              </div>
              {mergedResults.map((camper) => {
                const initials = camper.name
                  .split(" ")
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <button
                    key={camper.registrationId}
                    type="button"
                    onClick={() => handleSelect(camper)}
                    className="w-full text-left p-3 rounded-xl bg-bg-surface hover:bg-bg-subtle active:bg-surface-raised border border-border-default hover:border-accent-400 transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {camper.photoUrl ? (
                        <img
                          src={camper.photoUrl}
                          alt={camper.name}
                          className="h-12 w-12 rounded-full object-cover shrink-0 border border-border-default"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-accent-100 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 flex items-center justify-center font-bold text-sm shrink-0 border border-accent-200/50">
                          {initials || <UserIcon className="h-6 w-6" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-base font-bold text-txt-primary truncate">
                          {camper.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-txt-secondary mt-0.5">
                          {camper.registrationNumber && (
                            <span className="font-mono font-semibold text-accent-600 bg-accent-50 dark:bg-accent-950/40 px-1.5 py-0.5 rounded">
                              {camper.registrationNumber}
                            </span>
                          )}
                          {camper.tribeName && (
                            <Badge tone="info">
                              {camper.tribeName}
                            </Badge>
                          )}
                          {camper.campusName && (
                            <span className="text-txt-muted">· {camper.campusName}</span>
                          )}
                        </div>
                        {(camper.hostelName || camper.roomName) && (
                          <div className="text-xs text-txt-muted mt-0.5">
                            Room: {camper.hostelName || ""} {camper.roomName || ""} {camper.bedLabel ? `(${camper.bedLabel})` : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <Badge tone={camper.status === "CHECKED_IN" ? "success" : "neutral"}>
                        {camper.status === "CHECKED_IN" ? "Checked In" : "Approved"}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : value.trim().length >= 2 ? (
            <div className="py-12 text-center space-y-3">
              <IdentificationIcon className="h-12 w-12 text-txt-muted mx-auto opacity-50" />
              <p className="text-base font-bold text-txt-primary">No matching campers found</p>
              <p className="text-xs text-txt-muted max-w-xs mx-auto">
                Check the spelling of the name, try entering the phone number or exact registration #.
              </p>
            </div>
          ) : (
            <div className="py-12 text-center space-y-2 text-txt-muted">
              <MagnifyingGlassIcon className="h-10 w-10 mx-auto opacity-40" />
              <p className="text-sm font-semibold">Start typing to search campers...</p>
              <p className="text-xs">Search by camper name, registration number, or phone.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border-default bg-bg-subtle flex justify-end">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto cursor-pointer">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
