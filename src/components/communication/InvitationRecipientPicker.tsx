"use client";

import { useEffect, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export interface InvitationCandidate {
  registrationId: string;
  camperName: string;
  parentEmail: string;
  registrationNumber: string | null;
  tribeName: string | null;
  hostelName: string | null;
  roomName: string | null;
  bedLabel: string | null;
  readinessIssues: string[];
  lastInvitation: { sentAt: string | Date | null; deliveryStatus: string; openedAt: string | Date | null } | null;
}

export interface InvitationRecipientPickerProps {
  campId: string;
  value: string[];
  onChange: (registrationIds: string[]) => void;
  /** Registrations to hide from results even if they'd otherwise match —
   * e.g. a campaign detail page excluding recipients already resolved. */
  excludeRegistrationIds?: string[];
}

/** Searchable multi-select for targeting a Camp Invitation resend at
 * specific campers/parents instead of an audience filter. Modeled on
 * DirectorySearch.tsx's HeadlessUI Combobox + debounce pattern. Selection is
 * a plain registrationId[] so callers can pass it straight to
 * communication.invitationResend / campaignSend. */
export function InvitationRecipientPicker({ campId, value, onChange, excludeRegistrationIds }: InvitationRecipientPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Selected chips need to render camper/email even after the search result
  // that produced them has scrolled out of the query cache — accumulate
  // every candidate this component has ever seen rather than re-querying.
  const knownDetails = useRef(new Map<string, InvitationCandidate>());

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timeout);
  }, [query]);

  const enabled = !!campId && debounced.trim().length >= 2;
  const { data, isLoading } = api.communication.invitationCandidates.useQuery(
    { campId, q: debounced, limit: 20 },
    { enabled }
  );

  const excludeSet = new Set(excludeRegistrationIds ?? []);
  const allItems = ((data?.items ?? []) as unknown) as InvitationCandidate[];
  for (const item of allItems) knownDetails.current.set(item.registrationId, item);
  const items: InvitationCandidate[] = allItems.filter(
    (item) => !value.includes(item.registrationId) && !excludeSet.has(item.registrationId)
  );

  function handleSelect(item: InvitationCandidate | null) {
    if (!item || item.readinessIssues.length > 0) return;
    setQuery("");
    onChange([...value, item.registrationId]);
  }

  function removeRecipient(id: string) {
    onChange(value.filter((existing) => existing !== id));
  }

  const showEmpty = enabled && !isLoading && !!data && items.length === 0;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="invitation-recipient-chips">
          {value.map((id) => {
            const detail = knownDetails.current.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-raised px-2.5 py-1 text-xs text-txt-primary"
              >
                {detail ? `${detail.camperName} (${detail.parentEmail})` : id}
                <button
                  type="button"
                  onClick={() => removeRecipient(id)}
                  className="text-txt-muted hover:text-txt-primary"
                  aria-label="Remove recipient"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Combobox onChange={handleSelect} value={null}>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted" />
            <Combobox.Input
              data-testid="invitation-recipient-search-input"
              className="block min-h-[44px] w-full rounded-md border border-input-border bg-input-bg py-2.5 pl-9 pr-9 text-base text-txt-primary placeholder:text-txt-muted focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0 md:py-2 md:text-sm"
              placeholder="Search by camper name, parent email, or registration number…"
              displayValue={() => query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
              </div>
            )}
          </div>

          {enabled && (
            <Combobox.Options
              static
              data-testid="invitation-recipient-search-results"
              className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-border-default bg-elevated shadow-lg"
            >
              {showEmpty ? (
                <div className="px-4 py-8 text-center text-sm text-txt-secondary">
                  <p className="font-medium text-txt-primary">No matching approved or checked-in registrations found</p>
                </div>
              ) : (
                items.map((item) => (
                  <Combobox.Option
                    key={item.registrationId}
                    value={item}
                    disabled={item.readinessIssues.length > 0}
                    className={({ active, disabled }) =>
                      cn(
                        "min-h-[44px] px-3 py-2 text-sm",
                        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                        active && !disabled ? "bg-surface-raised" : ""
                      )
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-txt-primary">{item.camperName}</div>
                        <div className="truncate text-xs text-txt-muted">
                          {item.parentEmail}
                          {item.registrationNumber ? ` · #${item.registrationNumber}` : ""}
                          {item.tribeName ? ` · ${item.tribeName}` : ""}
                          {item.bedLabel
                            ? ` · ${item.hostelName ? `${item.hostelName} ` : ""}${item.roomName ? `${item.roomName} ` : ""}${item.bedLabel}`
                            : ""}
                        </div>
                        {item.readinessIssues.length > 0 && (
                          <div className="mt-1 text-xs text-status-warning">{item.readinessIssues.join(" ")}</div>
                        )}
                      </div>
                      {item.readinessIssues.length > 0 ? (
                        <Badge tone="warning">Not ready</Badge>
                      ) : item.lastInvitation ? (
                        <Badge tone="info">
                          Sent{item.lastInvitation.sentAt ? ` ${new Date(item.lastInvitation.sentAt).toLocaleDateString()}` : ""}
                          {item.lastInvitation.openedAt ? " · opened" : ""}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Not yet sent</Badge>
                      )}
                    </div>
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          )}
        </Combobox>
      </div>
    </div>
  );
}
