"use client";

import { useEffect, useState } from "react";
import { OfflineDownloadModal } from "@/components/scan/OfflineDownloadModal";
import { getCamperCountOffline } from "@/lib/offlineDb";

const REMINDER_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
const NEVER_REMIND_KEY = "camply-offline-setup-never";
const SNOOZE_UNTIL_KEY = "camply-offline-setup-snooze-until";

function storageKey(base: string, organizationId: string) {
  return `${base}:${organizationId}`;
}

function isInstalledPwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
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

    const evaluateSetup = async (installedNow = false) => {
      const installed = installedNow || isInstalledPwa();
      if (!installed) return;
      if (localStorage.getItem(storageKey(NEVER_REMIND_KEY, organizationId)) === "1") return;

      const snoozeUntil = Number(localStorage.getItem(storageKey(SNOOZE_UNTIL_KEY, organizationId)) || "0");
      if (snoozeUntil > Date.now()) return;

      const camperCount = await getCamperCountOffline();
      if (!cancelled && camperCount === 0) {
        promptTimer = setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, 700);
      }
    };

    const handleInstalled = () => void evaluateSetup(true);
    const handleOfflineReady = () => setOpen(false);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("camply:offline-data-ready", handleOfflineReady);
    void evaluateSetup();

    return () => {
      cancelled = true;
      if (promptTimer) clearTimeout(promptTimer);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("camply:offline-data-ready", handleOfflineReady);
    };
  }, [organizationId, role]);

  const snooze = () => {
    localStorage.setItem(
      storageKey(SNOOZE_UNTIL_KEY, organizationId),
      String(Date.now() + REMINDER_DELAY_MS)
    );
    setOpen(false);
  };

  const neverRemind = () => {
    localStorage.setItem(storageKey(NEVER_REMIND_KEY, organizationId), "1");
    localStorage.removeItem(storageKey(SNOOZE_UNTIL_KEY, organizationId));
    setOpen(false);
  };

  return (
    <OfflineDownloadModal
      open={open}
      onClose={snooze}
      organizationId={organizationId}
      setupGuide
      onNeverRemind={neverRemind}
      onSuccess={() => {
        localStorage.removeItem(storageKey(SNOOZE_UNTIL_KEY, organizationId));
        setOpen(false);
      }}
    />
  );
}
