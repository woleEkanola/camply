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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-default pb-3">
        <div className="flex items-center space-x-2">
          <SparklesIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <div>
            <h3 className="font-bold text-base text-txt-primary">Real-Time Branding Preview</h3>
          </div>
        </div>

        {/* Viewport Tab Switcher */}
        <div className="flex space-x-1 bg-bg-subtle p-1 rounded-xl border border-border-subtle text-xs overflow-x-auto">
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

      {/* Global Theme Responsive Viewport Studio */}
      <div className="min-h-[260px] rounded-xl border border-border-subtle bg-bg-subtle p-4 flex items-center justify-center overflow-hidden">
        {activeTab === "dashboard" && (
          <div className="w-full max-w-md bg-surface border border-border-default rounded-xl overflow-hidden shadow-lg">
            <div className="h-12 bg-surface-raised border-b border-border-default px-4 flex items-center justify-between">
              <div className="h-7 w-28 flex items-center">
                <img src={brandLogo} alt="Brand" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="h-6 w-6 rounded-full bg-surface border border-border-default flex items-center justify-center text-[10px] font-bold text-txt-secondary">
                AD
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="h-3.5 w-28 bg-surface-raised rounded-xs" />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="h-12 p-2 rounded-lg bg-surface-raised border border-border-subtle space-y-1">
                  <div className="h-2.5 w-12 bg-border-default rounded-xs" />
                  <div className="h-4 w-8 bg-teal-500/20 rounded-xs" />
                </div>
                <div className="h-12 p-2 rounded-lg bg-surface-raised border border-border-subtle space-y-1">
                  <div className="h-2.5 w-12 bg-border-default rounded-xs" />
                  <div className="h-4 w-8 bg-amber-500/20 rounded-xs" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "login" && (
          <div
            className="w-full max-w-sm rounded-xl p-5 flex flex-col items-center justify-center space-y-3 shadow-lg border border-border-subtle"
            style={{ backgroundColor: accentColor }}
          >
            <div className="h-10 w-32 flex items-center justify-center">
              <img src={brandLogo} alt="Login Logo" className="max-h-full max-w-full object-contain drop-shadow-sm" />
            </div>
            <div className="w-full bg-surface p-4 rounded-xl shadow-md space-y-2.5 text-txt-primary">
              <div className="text-center font-bold text-xs">Sign In</div>
              <div className="h-7 w-full bg-bg-subtle rounded-md border border-border-default px-2.5 flex items-center text-[11px] text-txt-muted">
                user@organization.org
              </div>
              <div
                className="h-7 w-full rounded-md flex items-center justify-center text-[11px] font-bold text-white shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                Sign In
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="w-full max-w-md bg-surface text-txt-primary rounded-xl overflow-hidden shadow-lg border border-border-default">
            <div className="p-4 border-b border-border-subtle flex flex-col items-center justify-center space-y-1 bg-bg-subtle">
              <img src={emailLogo} alt="Email Logo" className="h-8 max-w-[180px] object-contain" />
              <span className="text-[10px] text-txt-muted font-medium">{tagline}</span>
            </div>
            <div className="p-4 text-xs space-y-2 text-txt-secondary">
              <p className="font-bold text-sm text-txt-primary">Registration Confirmation</p>
              <p>Welcome to {orgName}! Your registration has been received.</p>
            </div>
          </div>
        )}

        {activeTab === "idcard" && (
          <div className="w-60 bg-surface text-txt-primary rounded-xl shadow-lg overflow-hidden border border-border-default flex flex-col items-center p-4 space-y-3">
            <div className="h-8 w-full flex items-center justify-center border-b border-border-subtle pb-1">
              <img src={idCardLogo} alt="ID Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="h-16 w-16 rounded-full bg-bg-subtle border border-border-default flex items-center justify-center font-bold text-txt-muted text-[10px]">
              PHOTO
            </div>
            <div className="text-center">
              <p className="font-bold text-xs text-txt-primary">CAMPER NAME</p>
              <p className="text-[9px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider">{orgName}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
