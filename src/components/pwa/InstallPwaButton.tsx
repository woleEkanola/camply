"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ShareIcon,
  CheckCircleIcon,
  EllipsisVerticalIcon,
  DevicePhoneMobileIcon,
  XMarkIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { getPwaPlatform } from "@/lib/pwaPlatform";
import { getDeferredPwaPrompt, triggerNativePwaInstall } from "@/lib/pwaPrompt";
import { cn } from "@/lib/cn";

interface InstallPwaButtonProps {
  variant?: "header" | "sidebar" | "menu";
}

export function InstallPwaButton({ variant = "header" }: InstallPwaButtonProps) {
  const [hasPrompt, setHasPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showChromeNudge, setShowChromeNudge] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");
    setIsStandalone(standalone);

    const checkPrompt = () => {
      setHasPrompt(Boolean(getDeferredPwaPrompt()));
    };

    checkPrompt();

    const handlePromptAvailable = () => {
      setHasPrompt(true);
    };

    const handleInstalled = () => {
      setIsStandalone(true);
      setHasPrompt(false);
    };

    window.addEventListener("camply:pwa-prompt-available", handlePromptAvailable);
    window.addEventListener("camply:pwa-installed", handleInstalled);
    window.addEventListener("appinstalled", handleInstalled);

    const platform = getPwaPlatform();
    setIsIos(platform.isIos);
    setIsAndroid(platform.isAndroid);
    setIsDesktop(platform.isDesktop);
    setShowChromeNudge(platform.isAndroid && !platform.isChrome);

    return () => {
      window.removeEventListener("camply:pwa-prompt-available", handlePromptAvailable);
      window.removeEventListener("camply:pwa-installed", handleInstalled);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // If the browser provided a native beforeinstallprompt, trigger it directly!
    const result = await triggerNativePwaInstall();
    if (result.triggered) {
      if (result.outcome === "accepted") {
        setIsStandalone(true);
      }
      return;
    }

    // Fallback: If native prompt isn't supported or was already consumed, show the step-by-step modal guide
    setShowGuideModal(true);
  };

  // If already running in standalone PWA mode
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

  // Desktop users only see install in menu if desired
  if (isDesktop && variant === "header") {
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
        {showGuideModal && (
          <InstallInstructionModal
            isIos={isIos}
            isAndroid={isAndroid}
            onClose={() => setShowGuideModal(false)}
          />
        )}
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
        {showGuideModal && (
          <InstallInstructionModal
            isIos={isIos}
            isAndroid={isAndroid}
            onClose={() => setShowGuideModal(false)}
          />
        )}
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
      {showGuideModal && (
        <InstallInstructionModal
          isIos={isIos}
          isAndroid={isAndroid}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </>
  );
}

function InstallInstructionModal({
  isIos,
  isAndroid,
  onClose,
}: {
  isIos: boolean;
  isAndroid: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"android" | "ios" | "other">(
    isIos ? "ios" : isAndroid ? "android" : "android"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-slate-900 text-white p-6 rounded-2xl max-w-md w-full space-y-5 shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400">
              <DevicePhoneMobileIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Install Camply PWA</h3>
              <p className="text-xs text-slate-400">Fast offline scanning & quick home screen access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch for Android vs iOS */}
        <div className="flex rounded-xl bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setTab("android")}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-bold transition",
              tab === "android" ? "bg-teal-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            )}
          >
            Chrome on Android
          </button>
          <button
            type="button"
            onClick={() => setTab("ios")}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-bold transition",
              tab === "ios" ? "bg-teal-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            )}
          >
            iOS (Safari)
          </button>
          <button
            type="button"
            onClick={() => setTab("other")}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-bold transition",
              tab === "other" ? "bg-teal-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            )}
          >
            Other Browsers
          </button>
        </div>

        {tab === "android" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-300">
              Follow these simple steps in <strong>Google Chrome for Android</strong>:
            </div>
            <ol className="space-y-3 text-xs text-slate-200">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  Tap the <EllipsisVerticalIcon className="inline h-4 w-4 text-teal-400 font-bold" /> <strong>three dots menu (⋮)</strong> in the top-right corner of Chrome.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  Tap <strong>"Install app"</strong> (or <strong>"Add to Home screen"</strong> on some devices).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  Tap <strong>"Install"</strong> in the prompt. Camply will install as a standalone app!
                </span>
              </li>
            </ol>
          </div>
        )}

        {tab === "ios" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-300">
              Follow these steps in <strong>Safari on iPhone or iPad</strong>:
            </div>
            <ol className="space-y-3 text-xs text-slate-200">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  Tap the <ShareIcon className="inline h-4 w-4 text-teal-400 font-bold" /> <strong>Share</strong> button at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  Scroll down the share sheet and tap <strong>"Add to Home Screen"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  Tap <strong>"Add"</strong> in the top-right corner.
                </span>
              </li>
            </ol>
          </div>
        )}

        {tab === "other" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-300">
              For <strong>Samsung Internet, Firefox, Edge, or Desktop</strong>:
            </div>
            <ol className="space-y-3 text-xs text-slate-200">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  Open your browser menu (usually <strong>☰</strong> or <strong>⋮</strong>).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  Select <strong>"Add page to"</strong> ➔ <strong>"Home screen"</strong> or <strong>"Install Camply"</strong>.
                </span>
              </li>
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-xs text-white transition shadow-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
