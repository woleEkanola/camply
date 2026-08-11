"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/trpc";
import { offline } from "@/lib/offlineEngine";
import { DownloadProfile, DownloadScope, saveSyncMeta, mergeDeltaCampers } from "@/lib/offlineDb";
import { CpuChipIcon, CircleStackIcon, PhotoIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface OfflineDownloadModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onSuccess?: () => void;
}

export interface ProgressState {
  status: "idle" | "downloading" | "complete" | "cancelled" | "error";
  currentCount: number;
  totalCount: number;
  currentBytes: number;
  totalBytes: number;
  percentage: number;
  stageMessage: string;
  error?: string;
}

export function OfflineDownloadModal({
  open,
  onClose,
  organizationId,
  onSuccess,
}: OfflineDownloadModalProps) {
  const [profile, setProfile] = useState<DownloadProfile>("FULL");
  const [scope, setScope] = useState<DownloadScope>("ENTIRE_CAMP");
  const [includeThumbnails, setIncludeThumbnails] = useState<boolean>(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [progress, setProgress] = useState<ProgressState>({
    status: "idle",
    currentCount: 0,
    totalCount: 0,
    currentBytes: 0,
    totalBytes: 0,
    percentage: 0,
    stageMessage: "",
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const utils = api.useUtils();

  const estimateQuery = api.scan.getOfflineDatasetEstimate.useQuery(
    { organizationId, profile, scope, includeThumbnails },
    { enabled: open && progress.status !== "downloading" }
  );

  useEffect(() => {
    if (open) {
      checkStorage();
    } else {
      // Cancel active download if modal is closed
      if (progress.status === "downloading" && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setProgress({
        status: "idle",
        currentCount: 0,
        totalCount: 0,
        currentBytes: 0,
        totalBytes: 0,
        percentage: 0,
        stageMessage: "",
      });
    }
  }, [open]);

  const checkStorage = async () => {
    const est = await offline.estimateStorage();
    if (est && est.remainingBytes < 20 * 1024 * 1024) {
      setStorageWarning("Storage space is low. Consider choosing Text Data Only or a targeted profile.");
    } else {
      setStorageWarning(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStartDownload = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const estCount = estimateQuery.data?.estimatedCamperCount ?? 0;
    const estBytes = estimateQuery.data?.estimatedSizeBytes ?? 0;

    setProgress({
      status: "downloading",
      currentCount: 0,
      totalCount: estCount,
      currentBytes: 0,
      totalBytes: estBytes,
      percentage: 5,
      stageMessage: "Initializing connection...",
    });

    try {
      await offline.requestPersistence();

      if (controller.signal.aborted) return;

      setProgress((p) => ({ ...p, percentage: 15, stageMessage: "Fetching dataset payload..." }));

      const result = await utils.scan.getDeltaSyncData.fetch({
        organizationId,
        profile,
        scope,
        includeThumbnails,
      });

      if (controller.signal.aborted) {
        setProgress((p) => ({ ...p, status: "cancelled", stageMessage: "Download cancelled by user." }));
        return;
      }

      if (result && result.updatedCampers) {
        const count = result.updatedCampers.length;
        setProgress({
          status: "downloading",
          currentCount: count,
          totalCount: count,
          currentBytes: estBytes,
          totalBytes: estBytes,
          percentage: 75,
          stageMessage: "Writing records to IndexedDB...",
        });

        const storedCount = await mergeDeltaCampers(result.updatedCampers, result.deletedRegistrationIds);
        await saveSyncMeta({
          lastSyncedAt: result.serverSyncTimestamp,
          profile,
          scope,
          camperCount: storedCount,
        });

        setProgress({
          status: "complete",
          currentCount: storedCount,
          totalCount: storedCount,
          currentBytes: estBytes,
          totalBytes: estBytes,
          percentage: 100,
          stageMessage: `Successfully cached ${storedCount} campers offline!`,
        });

        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      if (controller.signal.aborted || err.name === "AbortError") {
        setProgress((p) => ({ ...p, status: "cancelled", stageMessage: "Download cancelled by user." }));
      } else {
        console.error("Failed to download dataset:", err);
        setProgress((p) => ({
          ...p,
          status: "error",
          stageMessage: "Download failed.",
          error: err.message || "Network error during download.",
        }));
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProgress({
      status: "cancelled",
      currentCount: 0,
      totalCount: 0,
      currentBytes: 0,
      totalBytes: 0,
      percentage: 0,
      stageMessage: "Download cancelled by user.",
    });
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
        {progress.status === "downloading" ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-txt-primary">{progress.stageMessage}</span>
              <span className="text-teal-600 font-bold">{progress.percentage}%</span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-3 bg-bg-subtle rounded-full overflow-hidden border border-border-default">
              <div
                className="h-full bg-teal-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-bg-subtle p-3 rounded-xl border border-border-default">
              <div>
                <span className="text-txt-secondary block">Downloaded Campers</span>
                <span className="font-bold text-txt-primary text-sm">
                  {progress.currentCount} / {progress.totalCount}
                </span>
              </div>
              <div>
                <span className="text-txt-secondary block">Data Size</span>
                <span className="font-bold text-txt-primary text-sm">
                  {formatSize(progress.currentBytes)} / {formatSize(progress.totalBytes)}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              icon={<XCircleIcon className="h-4 w-4 text-red-600" />}
              onClick={handleCancelDownload}
            >
              Cancel Download
            </Button>
          </div>
        ) : (
          <>
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

            <div>
              <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-2">
                3. Photo Payload Preference
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIncludeThumbnails(true)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                    includeThumbnails
                      ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                      : "border-border-default bg-bg-surface hover:bg-bg-subtle text-txt-primary"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <PhotoIcon className="h-4 w-4 text-teal-600" />
                    <span className="text-xs font-bold">With Photos</span>
                  </div>
                  <span className="text-[11px] text-txt-secondary mt-1">~35 KB / camper</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIncludeThumbnails(false)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                    !includeThumbnails
                      ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                      : "border-border-default bg-bg-surface hover:bg-bg-subtle text-txt-primary"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <CpuChipIcon className="h-4 w-4 text-teal-600" />
                    <span className="text-xs font-bold">Text Data Only</span>
                  </div>
                  <span className="text-[11px] text-txt-secondary mt-1">~6 KB / camper</span>
                </button>
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
                    Estimated Download: {formatSize(estimateQuery.data?.estimatedSizeBytes ?? 0)} (
                    {includeThumbnails ? "With Photos" : "Text Only"})
                  </div>
                </div>
              </div>
            </div>

            {storageWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                {storageWarning}
              </p>
            )}

            {progress.status === "cancelled" && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                Download was cancelled. Select options and try again.
              </p>
            )}

            <Button
              className="w-full h-12 text-base"
              icon={<CpuChipIcon className="h-5 w-5" />}
              loading={estimateQuery.isLoading}
              onClick={handleStartDownload}
            >
              Start Download
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
