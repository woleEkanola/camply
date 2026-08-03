"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MagnifyingGlassIcon, UserIcon } from "@heroicons/react/24/outline";
import { offline } from "@/lib/offlineEngine";
import { OfflineCamper } from "@/lib/offlineDb";

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  onSelectCamper?: (camper: OfflineCamper) => void;
}

/**
 * Real-time instant offline text search sheet. Queries IndexedDB indexes
 * on name, registration number, parent/teen phone numbers as the user types.
 */
export function SearchSheet({ open, onClose, onSearch, onSelectCamper }: SearchSheetProps) {
  const [value, setValue] = useState("");
  const [liveResults, setLiveResults] = useState<OfflineCamper[]>([]);

  useEffect(() => {
    if (!value.trim()) {
      setLiveResults([]);
      return;
    }

    let active = true;
    offline.search(value.trim(), 5).then((results) => {
      if (active) setLiveResults(results);
    });

    return () => {
      active = false;
    };
  }, [value]);

  const submit = () => {
    if (!value.trim()) return;
    onSearch(value.trim());
    setValue("");
    onClose();
  };

  const handleSelect = (camper: OfflineCamper) => {
    if (onSelectCamper) {
      onSelectCamper(camper);
    } else {
      onSearch(camper.registrationNumber || camper.name);
    }
    setValue("");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Search Camper Database">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-txt-muted" />
          <Input
            autoFocus
            className="pl-10 h-12 text-base"
            placeholder="Name, registration #, or phone…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        {liveResults.length > 0 && (
          <div className="border border-border-default rounded-xl overflow-hidden divide-y divide-border-default bg-bg-surface">
            {liveResults.map((c) => (
              <button
                key={c.registrationId}
                type="button"
                onClick={() => handleSelect(c)}
                className="w-full p-3 text-left hover:bg-bg-subtle flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-txt-primary">{c.name}</div>
                    <div className="text-xs text-txt-secondary">
                      {c.registrationNumber} {c.tribeName ? `• ${c.tribeName}` : ""}
                    </div>
                  </div>
                </div>
                <UserIcon className="h-4 w-4 text-txt-muted" />
              </button>
            ))}
          </div>
        )}

        <Button type="submit" className="w-full h-12 text-base" disabled={!value.trim()}>
          Search
        </Button>
      </form>
    </BottomSheet>
  );
}
