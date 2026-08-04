"use client";

import { useState } from "react";
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  IdentificationIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

interface BrandingLivePreviewProps {
  masterLogoUrl?: string | null;
  emailLogoUrl?: string | null;
  idCardLogoUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  tagline?: string;
  orgName?: string;
}

export function BrandingLivePreview({
  masterLogoUrl,
  emailLogoUrl,
  idCardLogoUrl,
  primaryColor = "#0D9488",
  accentColor = "#E67E22",
  tagline = "Empowering Summer Camp Experiences",
  orgName = "Camply Assembly",
}: BrandingLivePreviewProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "login" | "email" | "idcard">("dashboard");

  const brandLogo = masterLogoUrl || "/logo.png";
  const emailLogo = emailLogoUrl || brandLogo;
  const idCardLogo = idCardLogoUrl || brandLogo;

  return (
    <div className="p-5 rounded-2xl bg-surface border border-border-default shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-default pb-3">
        <div className="flex items-center space-x-2">
          <SparklesIcon className="h-5 w-5 text-teal-600" />
          <h3 className="font-bold text-base text-txt-primary">Real-Time Branding Preview</h3>
        </div>

        {/* Tab Switcher */}
        <div className="flex space-x-1 overflow-x-auto bg-bg-subtle p-1 rounded-xl border border-border-subtle text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "dashboard"
                ? "bg-surface text-txt-primary shadow-xs"
                : "text-txt-muted hover:text-txt-primary"
            }`}
          >
            <ComputerDesktopIcon className="h-4 w-4" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "login"
                ? "bg-surface text-txt-primary shadow-xs"
                : "text-txt-muted hover:text-txt-primary"
            }`}
          >
            <DevicePhoneMobileIcon className="h-4 w-4" />
            Login
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "email"
                ? "bg-surface text-txt-primary shadow-xs"
                : "text-txt-muted hover:text-txt-primary"
            }`}
          >
            <EnvelopeIcon className="h-4 w-4" />
            Email
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("idcard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "idcard"
                ? "bg-surface text-txt-primary shadow-xs"
                : "text-txt-muted hover:text-txt-primary"
            }`}
          >
            <IdentificationIcon className="h-4 w-4" />
            ID Card
          </button>
        </div>
      </div>

      {/* Preview Viewports */}
      <div className="min-h-[260px] rounded-xl border border-border-subtle bg-neutral-950 p-4 flex items-center justify-center overflow-hidden">
        {activeTab === "dashboard" && (
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="h-12 bg-neutral-950 border-b border-neutral-800 px-4 flex items-center justify-between">
              <div className="h-7 w-24 flex items-center">
                <img src={brandLogo} alt="Brand" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="h-6 w-6 rounded-full bg-neutral-800 border border-neutral-700" />
            </div>
            <div className="p-4 space-y-2">
              <div className="h-4 w-1/3 bg-neutral-800 rounded-md" />
              <div className="h-16 w-full bg-neutral-800/40 rounded-lg border border-neutral-800 p-2" />
            </div>
          </div>
        )}

        {activeTab === "login" && (
          <div className="w-full max-w-sm rounded-xl p-6 flex flex-col items-center justify-center space-y-4" style={{ backgroundColor: accentColor }}>
            <div className="h-10 w-32 flex items-center justify-center">
              <img src={brandLogo} alt="Login Logo" className="max-h-full max-w-full object-contain drop-shadow-md" />
            </div>
            <div className="w-full bg-white dark:bg-neutral-900 p-4 rounded-xl shadow-xl space-y-3">
              <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-md mx-auto" />
              <div className="h-8 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full border border-neutral-300 dark:border-neutral-700" />
              <div className="h-8 w-full rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ backgroundColor: primaryColor }}>
                Sign In
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="w-full max-w-md bg-white text-neutral-900 rounded-xl overflow-hidden shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-100 flex flex-col items-center justify-center space-y-1 bg-neutral-50">
              <img src={emailLogo} alt="Email Logo" className="h-9 max-w-[200px] object-contain" />
              <span className="text-[10px] text-neutral-500 font-medium">{tagline}</span>
            </div>
            <div className="p-4 text-xs space-y-2 text-neutral-700">
              <p className="font-bold text-sm text-neutral-900">Registration Confirmation</p>
              <p>Welcome to {orgName}! Your registration has been received.</p>
            </div>
          </div>
        )}

        {activeTab === "idcard" && (
          <div className="w-64 bg-white text-neutral-900 rounded-2xl shadow-2xl overflow-hidden border border-neutral-300 flex flex-col items-center p-4 space-y-3">
            <div className="h-8 w-full flex items-center justify-center">
              <img src={idCardLogo} alt="ID Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="h-20 w-20 rounded-full bg-neutral-200 border-2 border-neutral-300 flex items-center justify-center font-bold text-neutral-400">
              PHOTO
            </div>
            <div className="text-center">
              <p className="font-bold text-sm text-neutral-900">CAMPER NAME</p>
              <p className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">{orgName}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
