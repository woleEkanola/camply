"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, ShareIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function InstallPwaBanner() {
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if already in standalone mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Dismissal check (don't bug user if dismissed within 14 days)
    const lastDismissed = localStorage.getItem("camply_pwa_dismissed");
    if (lastDismissed) {
      const daysSince = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 14) return;
    }

    // Android / Chromium prompt listener
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroidPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // iOS Safari detection
    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua);

    if (isIos && isSafari && !isStandalone) {
      setShowIosPrompt(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setShowAndroidPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("camply_pwa_dismissed", Date.now().toString());
    setShowAndroidPrompt(false);
    setShowIosPrompt(false);
  };

  if (!showAndroidPrompt && !showIosPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 animate-slide-up">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-teal-500 flex items-center justify-center font-bold text-white text-lg">
            C
          </div>
          <div>
            <h4 className="font-semibold text-sm">Install Camply PWA</h4>
            <p className="text-xs text-slate-300">Fast, 100% reliable offline QR scanning</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-slate-400 hover:text-white p-1">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {showAndroidPrompt && (
        <div className="mt-3">
          <button
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center py-2.5 px-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-semibold text-sm transition"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            Add to Home Screen
          </button>
        </div>
      )}

      {showIosPrompt && (
        <div className="mt-3 bg-slate-800 p-3 rounded-xl text-xs text-slate-300 space-y-2 border border-slate-700">
          <p className="font-medium text-white flex items-center">
            To install on iPhone / iPad:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-300">
            <li>
              Tap the <ShareIcon className="h-4 w-4 inline text-teal-400 mx-1" /> <strong>Share</strong> button in Safari toolbar
            </li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Confirm by tapping <strong>Add</strong></li>
          </ol>
        </div>
      )}
    </div>
  );
}
