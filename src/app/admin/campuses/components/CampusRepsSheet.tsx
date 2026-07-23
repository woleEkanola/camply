"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { SearchBar } from "@/components/ui/SearchBar";
import { Button } from "@/components/ui/Button";
import { UserGroupIcon, PlusIcon, UserIcon, CheckIcon } from "@heroicons/react/24/outline";

export interface CandidateUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

export interface CampusRepsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  campusName: string;
  availableAdmins: CandidateUser[];
  selectedAdminIds: string[];
  onSelectionChange: (adminId: string, selected: boolean) => void;
  onSave: () => void;
  isSubmitting?: boolean;
  error?: string;
}

export const CampusRepsSheet: React.FC<CampusRepsSheetProps> = ({
  isOpen,
  onClose,
  campusName,
  availableAdmins,
  selectedAdminIds,
  onSelectionChange,
  onSave,
  isSubmitting = false,
  error,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAdmins = availableAdmins.filter((admin) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.toLowerCase();
    return fullName.includes(query) || admin.email.toLowerCase().includes(query);
  });

  const selectedReps = availableAdmins.filter((a) => selectedAdminIds.includes(a.id));

  return (
    <Dialog open={isOpen} onClose={onClose} title={`Representatives — ${campusName}`} size="md">
      {error && (
        <div className="mb-4 rounded-xl status-danger p-3.5 text-xs font-medium ">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* CURRENT ASSIGNED REPS ROSTER */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-txt-secondary mb-2.5 flex items-center gap-1.5">
            <UserGroupIcon className="h-4 w-4 text-txt-secondary" />
            Assigned Roster ({selectedReps.length})
          </h4>

          {selectedReps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-default bg-surface-raised/70 p-4 text-center text-xs text-txt-secondary">
              No representatives assigned yet. Select candidates below to assign them.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {selectedReps.map((rep) => {
                const name = [rep.firstName, rep.lastName].filter(Boolean).join(" ").trim();
                const initials = name
                  ? name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                  : rep.email.slice(0, 2).toUpperCase();

                return (
                  <div
                    key={rep.id}
                    className="flex items-center justify-between rounded-xl border border-border-default/90 bg-surface p-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 font-semibold text-accent-800 text-xs">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-txt-primary">{name || rep.email}</p>
                        <p className="text-xs text-txt-secondary">
                          Campus Rep {rep.email && name ? `· ${rep.email}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectionChange(rep.id, false)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-danger-600 hover:bg-danger-50"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CANDIDATES SELECTION AREA */}
        <div className="border-t border-border-subtle pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-txt-secondary mb-2.5">
            Add Representative
          </h4>

          <div className="mb-3">
            <SearchBar
              placeholder="Search candidate by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border-default divide-y divide-border-subtle bg-surface">
            {filteredAdmins.length === 0 ? (
              <p className="p-4 text-center text-xs text-txt-secondary">No matching users found.</p>
            ) : (
              filteredAdmins.map((admin) => {
                const isChecked = selectedAdminIds.includes(admin.id);
                const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim();

                return (
                  <label
                    key={admin.id}
                    className="flex cursor-pointer items-center justify-between p-3 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => onSelectionChange(admin.id, e.target.checked)}
                        className="h-4 w-4 rounded border-input-border text-accent-600 focus:ring-accent-500"
                      />
                      <div>
                        <p className="text-xs font-semibold text-txt-primary">{name || admin.email}</p>
                        <p className="text-[11px] text-txt-secondary">
                          {admin.email} {admin.role ? `· ${admin.role}` : ""}
                        </p>
                      </div>
                    </div>

                    {isChecked && (
                      <span className="inline-flex items-center gap-1 rounded-full status-success px-2 py-0.5 text-[11px] font-semibold ">
                        <CheckIcon className="h-3 w-3" />
                        Selected
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={onSave}>
            Save Representatives
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default CampusRepsSheet;
