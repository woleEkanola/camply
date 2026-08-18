"use client";

import React, { useState, useMemo } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import {
  ShieldCheckIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  ArrowRightIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

export interface MedicalDataCleanerModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  campId?: string;
  onSuccess?: () => void;
}

export function MedicalDataCleanerModal({
  open,
  onClose,
  organizationId,
  campId,
  onSuccess,
}: MedicalDataCleanerModalProps) {
  const toast = useToast();
  const utils = api.useUtils();

  const [activeTab, setActiveTab] = useState<"candidates" | "protected">("candidates");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [fieldFilter, setFieldFilter] = useState<string>("ALL");

  // Track selected candidates by unique key `${id}:${field}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = api.medicalClean.previewBulkCleanup.useQuery(
    { organizationId, campId },
    { enabled: open && !!organizationId }
  );

  const cleanMutation = api.medicalClean.executeBulkCleanup.useMutation({
    onSuccess: (res) => {
      toast.success(`Successfully cleaned ${res.cleanedCount} placeholder medical field(s).`);
      utils.registration.adminList.invalidate();
      utils.registration.getById.invalidate();
      utils.staff.adminList.invalidate();
      utils.staff.getById.invalidate();
      refetch();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const candidates = data?.candidates ?? [];
  const preservedHighlights = data?.preservedHighlights ?? [];
  const summary = data?.summary;

  // Initialize selected keys when candidates load
  React.useEffect(() => {
    if (candidates.length > 0 && selectedKeys.size === 0) {
      const allKeys = new Set(candidates.map((c) => `${c.id}:${c.field}`));
      setSelectedKeys(allKeys);
    }
  }, [candidates]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (roleFilter !== "ALL" && c.role !== roleFilter) return false;
      if (fieldFilter !== "ALL" && c.field !== fieldFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.originalValue.toLowerCase().includes(q) ||
          c.fieldLabel.toLowerCase().includes(q) ||
          c.reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [candidates, roleFilter, fieldFilter, searchQuery]);

  // Filter preserved
  const filteredPreserved = useMemo(() => {
    return preservedHighlights.filter((p) => {
      if (roleFilter !== "ALL" && p.role !== roleFilter) return false;
      if (fieldFilter !== "ALL" && p.field !== fieldFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.value.toLowerCase().includes(q) ||
          p.fieldLabel.toLowerCase().includes(q) ||
          p.reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [preservedHighlights, roleFilter, fieldFilter, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredCandidates.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredCandidates.map((c) => `${c.id}:${c.field}`)));
    }
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExecuteClean = () => {
    const itemsToClean = candidates
      .filter((c) => selectedKeys.has(`${c.id}:${c.field}`))
      .map((c) => ({
        id: c.id,
        model: c.model,
        field: c.field,
        originalValue: c.originalValue,
      }));

    if (itemsToClean.length === 0) {
      toast.error("Please select at least one item to clean.");
      return;
    }

    cleanMutation.mutate({
      organizationId,
      items: itemsToClean,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Medical & Allergy Data Cleaner"
      className="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Placeholders Found
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-950">
                {summary?.placeholderCount ?? 0}
              </span>
              <span className="text-xs text-amber-700">fields to clean</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-800">
              e.g. &quot;None&quot;, &quot;N/A&quot;, &quot;Nil&quot;, &quot;-&quot;, &quot;No allergies&quot;
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Valid Conditions Kept
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-950">
                {summary?.validConditionsCount ?? 0}
              </span>
              <span className="text-xs text-emerald-700">real conditions</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-800">
              Preserved &amp; untouched by cleaner
            </p>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-sky-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-900">
                Protected Short Terms
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-sky-950">
                {summary?.shortTermsProtectedCount ?? 0}
              </span>
              <span className="text-xs text-sky-700">short entries shielded</span>
            </div>
            <p className="mt-1 text-[11px] text-sky-800">
              e.g. &quot;Egg&quot;, &quot;Nut&quot;, &quot;TB&quot;, &quot;HIV&quot;, &quot;IBS&quot;, &quot;DM&quot;
            </p>
          </div>
        </div>

        {/* Tab & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-default pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("candidates")}
              className={cn(
                "rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5",
                activeTab === "candidates"
                  ? "bg-accent-600 text-white shadow-2xs"
                  : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
              )}
            >
              <TrashIcon className="h-4 w-4" />
              Candidates for Clean-up ({candidates.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("protected")}
              className={cn(
                "rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5",
                activeTab === "protected"
                  ? "bg-accent-600 text-white shadow-2xs"
                  : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
              )}
            >
              <ShieldCheckIcon className="h-4 w-4" />
              Protected &amp; Valid Data ({preservedHighlights.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-border-default bg-surface px-2.5 py-1.5 text-xs font-medium text-txt-primary"
            >
              <option value="ALL">All Roles</option>
              <option value="CAMPER">Campers</option>
              <option value="TEACHER">Teachers</option>
              <option value="VOLUNTEER">Volunteers</option>
            </select>

            <select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="rounded-lg border border-border-default bg-surface px-2.5 py-1.5 text-xs font-medium text-txt-primary"
            >
              <option value="ALL">All Fields</option>
              <option value="allergies">Allergies</option>
              <option value="medicalConditions">Medical Conditions</option>
              <option value="medications">Medications</option>
              <option value="dietaryRestrictions">Dietary Restrictions</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div>
          <SearchBar
            placeholder="Search by name, placeholder text, field, or reason…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-txt-secondary">
            Scanning and analyzing medical records…
          </div>
        ) : activeTab === "candidates" ? (
          /* CANDIDATES TABLE */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-txt-muted px-1">
              <label className="flex items-center gap-2 font-bold cursor-pointer text-txt-primary">
                <input
                  type="checkbox"
                  checked={
                    filteredCandidates.length > 0 &&
                    selectedKeys.size === filteredCandidates.length
                  }
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-border-default text-accent-600 focus:ring-accent-500"
                />
                Select All ({selectedKeys.size} of {filteredCandidates.length} selected)
              </label>

              <span>
                These fields will be set to <code className="font-mono text-txt-primary font-bold">null</code> to remove false-positive alerts.
              </span>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center space-y-2">
                <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-600" />
                <h4 className="font-bold text-emerald-950 text-sm">No Placeholder Fields Found</h4>
                <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                  All medical and allergy records in this camp are clean and contain valid disclosures.
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border-default bg-surface divide-y divide-border-subtle">
                {filteredCandidates.map((item) => {
                  const key = `${item.id}:${item.field}`;
                  const isChecked = selectedKeys.has(key);

                  return (
                    <div
                      key={key}
                      onClick={() => toggleSelectKey(key)}
                      className={cn(
                        "flex items-center justify-between p-3 text-xs transition cursor-pointer hover:bg-surface-hover",
                        isChecked && "bg-accent-50/30"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-border-default text-accent-600 focus:ring-accent-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-txt-primary truncate">{item.name}</span>
                            <Badge tone={item.role === "CAMPER" ? "info" : "neutral"}>
                              {item.role}
                            </Badge>
                            <Badge tone="neutral">{item.fieldLabel}</Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-txt-secondary text-[11px]">
                            <span className="line-through text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-mono font-semibold">
                              &quot;{item.originalValue}&quot;
                            </span>
                            <ArrowRightIcon className="h-3 w-3 text-txt-muted shrink-0" />
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-bold">
                              null (Clean)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-3">
                        <span className="text-[11px] text-txt-muted font-medium block">
                          {item.reason}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* PROTECTED ENTRIES TABLE */
          <div className="space-y-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs text-sky-800">
              <strong>Shielded Clinical Data:</strong> The terms below are verified medical diagnoses, valid food allergies, or protected short terms (e.g. &quot;Egg&quot;, &quot;TB&quot;, &quot;Nut&quot;) and will <strong>never</strong> be deleted during cleanup.
            </div>

            {filteredPreserved.length === 0 ? (
              <div className="py-8 text-center text-xs text-txt-secondary">
                No matching preserved records found.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border-default bg-surface divide-y divide-border-subtle">
                {filteredPreserved.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-txt-primary truncate">{item.name}</span>
                        <Badge tone={item.role === "CAMPER" ? "info" : "neutral"}>
                          {item.role}
                        </Badge>
                        <Badge tone="neutral">{item.fieldLabel}</Badge>
                        {item.isShortTermProtected && (
                          <span className="rounded-full bg-sky-100 text-sky-800 font-bold px-2 py-0.5 text-[10px]">
                            Protected Short Term
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                          {item.value}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-3">
                      <span className="text-[11px] text-txt-muted font-medium">
                        {item.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between border-t border-border-default pt-4">
          <Button variant="secondary" onClick={onClose} disabled={cleanMutation.isPending}>
            Cancel
          </Button>

          {activeTab === "candidates" && (
            <Button
              variant="danger"
              disabled={selectedKeys.size === 0}
              loading={cleanMutation.isPending}
              onClick={handleExecuteClean}
            >
              Clean {selectedKeys.size} Placeholder Field{selectedKeys.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
