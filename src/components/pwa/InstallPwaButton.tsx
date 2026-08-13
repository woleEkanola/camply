"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, ShareIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { getPwaPlatform } from "@/lib/pwaPlatform";

interface InstallPwaButtonProps {
  variant?: "header" | "sidebar" | "menu";
}

export function InstallPwaButton({ variant = "header" }: InstallPwaButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showChromeNudge, setShowChromeNudge] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    const platform = getPwaPlatform();
    setIsIos(platform.isIos);
    setIsDesktop(platform.isDesktop);
    setShowChromeNudge(platform.isAndroid && !platform.isChrome);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosModal(true);
    } else {
      // Fallback for browsers where install event isn't captured
      alert("To install Camply: Open browser menu (⋮ or Share) and select 'Add to Home screen' or 'Install App'.");
    }
  };

  // The install experience (offline QR scanning, camera access) only holds
  // up on mobile — don't offer a portrait-locked, scan-focused PWA on desktop.
  if (isDesktop) return null;

  if (isStandalone) {
    if (variant === "menu") {
      return (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50">
          <CheckCircleIcon className="h-4 w-4" />
          App Installed
        </div>
      );
    }
    return null;
  }

  if (variant === "menu") {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40"
        >
          <ArrowDownTrayIcon className="h-4 w-4 text-teal-600" />
          <span>
            Install App
            {showChromeNudge && <span className="block text-[11px] font-normal text-teal-500">Works best in Chrome</span>}
          </span>
        </button>
        {showIosModal && <IosInstallInstructionModal onClose={() => setShowIosModal(false)} />}
      </>
    );
  }

  if (variant === "sidebar") {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
        >
          <ArrowDownTrayIcon className="h-5 w-5 shrink-0 text-teal-600" />
          <span>
            Install App
            {showChromeNudge && <span className="block text-[11px] font-normal text-teal-500">Works best in Chrome</span>}
          </span>
        </button>
        {showIosModal && <IosInstallInstructionModal onClose={() => setShowIosModal(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title={showChromeNudge ? "Install Camply PWA — works best in Chrome" : "Install Camply PWA"}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Install App</span>
      </button>
      {showIosModal && <IosInstallInstructionModal onClose={() => setShowIosModal(false)} />}
    </>
  );
}

function IosInstallInstructionModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-slate-900 text-white p-5 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl border border-slate-700">
        <h3 className="text-base font-bold flex items-center gap-2">
          <ArrowDownTrayIcon className="h-5 w-5 text-teal-400" />
          Install on iOS (iPhone / iPad)
        </h3>
        <ol className="text-xs space-y-2 text-slate-300 list-decimal list-inside">
          <li>
            Tap the <ShareIcon className="h-4 w-4 inline text-teal-400 mx-1" /> <strong>Share</strong> button in Safari's bottom toolbar
          </li>
          <li>Scroll down the menu and tap <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong> in the top-right corner</li>
        </ol>
        <button
          onClick={onClose}
          className="w-full py-2 bg-teal-600 hover:bg-teal-500 rounded-xl font-semibold text-xs text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
