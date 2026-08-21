"use client";

import { useEffect, useState } from "react";
import { OfflineDownloadModal } from "@/components/scan/OfflineDownloadModal";
import { getCamperCountOffline } from "@/lib/offlineDb";

function isInstalledPwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

export function OfflineSetupPrompt({
  organizationId,
  role,
}: {
  organizationId: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!organizationId || !role || !["OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE", "TEACHER", "VOLUNTEER"].includes(role)) {
      return;
    }

    let cancelled = false;
    let promptTimer: ReturnType<typeof setTimeout> | null = null;

    const checkAndPrompt = async (isExplicitInstallEvent = false) => {
      const installed = isExplicitInstallEvent || isInstalledPwa();
      if (!installed) return;

      // Always inspect offline database: if camper dataset is not downloaded, ALWAYS prompt the user
      try {
        const camperCount = await getCamperCountOffline();
        if (!cancelled && camperCount === 0) {
          promptTimer = setTimeout(() => {
            if (!cancelled) setOpen(true);
          }, 600);
        }
      } catch (err) {
        console.error("Error inspecting offline storage:", err);
      }
    };

    const handleInstalled = () => void checkAndPrompt(true);
    const handleOfflineReady = () => setOpen(false);

    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("camply:offline-data-ready", handleOfflineReady);

    void checkAndPrompt();

    return () => {
      cancelled = true;
      if (promptTimer) clearTimeout(promptTimer);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("camply:offline-data-ready", handleOfflineReady);
    };
  }, [organizationId, role]);

  return (
    <OfflineDownloadModal
      open={open}
      onClose={() => setOpen(false)}
      organizationId={organizationId}
      setupGuide
      onSuccess={() => {
        setOpen(false);
      }}
    />
  );
}
