"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/trpc";
import { offline } from "@/lib/offlineEngine";
import { DownloadProfile, DownloadScope, saveSyncMeta } from "@/lib/offlineDb";
import { CpuChipIcon, CheckCircleIcon, CircleStackIcon } from "@heroicons/react/24/outline";

interface OfflineDownloadModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onSuccess?: () => void;
}

export function OfflineDownloadModal({
  open,
  onClose,
  organizationId,
  onSuccess,
}: OfflineDownloadModalProps) {
  const [profile, setProfile] = useState<DownloadProfile>("FULL");
  const [scope, setScope] = useState<DownloadScope>("ENTIRE_CAMP");
  const [isDownloading, setIsDownloading] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const utils = api.useUtils();

  const estimateQuery = api.scan.getOfflineDatasetEstimate.useQuery(
    { organizationId, profile, scope },
    { enabled: open }
  );

  const deltaSyncMutation = api.scan.getDeltaSyncData.useQuery(
    { organizationId, profile, scope },
    { enabled: false }
  );

  useEffect(() => {
    if (open) {
      checkStorage();
    }
  }, [open]);

  const checkStorage = async () => {
    const est = await offline.estimateStorage();
    if (est && est.remainingBytes < 20 * 1024 * 1024) {
      setStorageWarning("Storage space is low. Consider choosing a targeted profile like Check-in or Food.");
    } else {
      setStorageWarning(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    try {
      // Request persistent browser storage
      await offline.requestPersistence();

      // Trigger sync download
      const result = await utils.scan.getDeltaSyncData.fetch({
        organizationId,
        profile,
        scope,
      });

      if (result && result.updatedCampers) {
        const { mergeDeltaCampers } = await import("@/lib/offlineDb");
        const count = await mergeDeltaCampers(result.updatedCampers, result.deletedRegistrationIds);
        await saveSyncMeta({
          lastSyncedAt: result.serverSyncTimestamp,
          profile,
          scope,
          camperCount: count,
        });
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to download dataset:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const profileOptions: { id: DownloadProfile; title: string; desc: string }[] = [
    { id: "FULL", title: "Full Camp (Recommended)", desc: "All campers, medical alerts, emergency contacts, hostel assignments" },
    { id: "CHECK_IN", title: "Check-in Station", desc: "Basic badge info & registration numbers for arrival" },
    { id: "FOOD", title: "Food Station", desc: "Dietary restrictions, allergies & meal distribution" },
    { id: "HOSTEL", title: "Hostel Station", desc: "Room, hostel, bed assignments & tribe labels" },
    { id: "TEACHER", title: "Teacher Scope", desc: "Assigned campers & campus teacher details" },
  ];

  const scopeOptions: { id: DownloadScope; title: string }[] = [
    { id: "ENTIRE_CAMP", title: "Entire Camp (Recommended for full offline safety)" },
    { id: "ASSIGNED_CAMPUS", title: "Assigned Campus only" },
    { id: "CURRENT_STATION", title: "Current Station filter" },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Download Offline Database">
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-2">
            1. Select Profile Scope
          </h4>
          <div className="space-y-2">
            {profileOptions.map((opt) => (
              <label
                key={opt.id}
                onClick={() => setProfile(opt.id)}
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  profile === opt.id
                    ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                    : "border-border-default bg-bg-surface hover:bg-bg-subtle text-txt-primary"
                }`}
              >
                <input
                  type="radio"
                  name="profile"
                  checked={profile === opt.id}
                  onChange={() => setProfile(opt.id)}
                  className="mt-1 text-teal-600 focus:ring-teal-500"
                />
                <div className="ml-3">
                  <div className="text-sm font-semibold">{opt.title}</div>
                  <div className="text-xs text-txt-secondary">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-2">
            2. Select Campers Scope
          </h4>
          <div className="space-y-2">
            {scopeOptions.map((opt) => (
              <label
                key={opt.id}
                onClick={() => setScope(opt.id)}
                className={`flex items-center p-3 rounded-xl border cursor-pointer transition ${
                  scope === opt.id
                    ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                    : "border-border-default bg-bg-surface hover:bg-bg-subtle text-txt-primary"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={scope === opt.id}
                  onChange={() => setScope(opt.id)}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="ml-3 text-sm">{opt.title}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <CircleStackIcon className="h-6 w-6 text-teal-400 shrink-0" />
            <div>
              <div className="text-sm font-bold">
                {estimateQuery.data?.estimatedCamperCount ?? 0} Campers
              </div>
              <div className="text-xs text-slate-300">
                Estimated Download: {formatSize(estimateQuery.data?.estimatedSizeBytes ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {storageWarning && (
          <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            {storageWarning}
          </p>
        )}

        <Button
          className="w-full h-12 text-base"
          icon={<CpuChipIcon className="h-5 w-5" />}
          loading={isDownloading || estimateQuery.isLoading}
          onClick={handleStartDownload}
        >
          Download for Offline Use
        </Button>
      </div>
    </BottomSheet>
  );
}
