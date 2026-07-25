"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

/**
 * Search is the exception path (most scans come from the camera), so it
 * lives behind a floating icon + sheet on mobile instead of a permanent
 * field costing vertical space on every session. Submits through the same
 * processScan `query` path as everything else, so results render via the
 * identical CamperResultCard-shaped overlays as a QR scan.
 */
export function SearchSheet({ open, onClose, onSearch }: SearchSheetProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onSearch(value.trim());
    setValue("");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Search">
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
            placeholder="Name, registration number, or phone…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full h-12 text-base" disabled={!value.trim()}>
          Search
        </Button>
      </form>
    </BottomSheet>
  );
}
