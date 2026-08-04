"use client";

import { useState } from "react";
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  IdentificationIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
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
  const [studioTheme, setStudioTheme] = useState<"light" | "dark">("light");

  const brandLogo = masterLogoUrl || "/logo.png";
  const emailLogo = emailLogoUrl || brandLogo;
  const idCardLogo = idCardLogoUrl || brandLogo;

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-800 pb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">Real-Time Branding Preview</h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Live preview of how your brand logos render across Camply touchpoints</p>
          </div>
        </div>

        {/* Controls: Tab Switcher & Light/Dark Preview Mode */}
        <div className="flex items-center space-x-2 overflow-x-auto">
          {/* Studio Theme Toggle */}
          <div className="flex bg-slate-100 dark:bg-neutral-800 p-1 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs">
            <button
              type="button"
              onClick={() => setStudioTheme("light")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                studioTheme === "light"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-neutral-400"
              }`}
            >
              <SunIcon className="h-3.5 w-3.5 text-amber-500" />
              Light
            </button>
            <button
              type="button"
              onClick={() => setStudioTheme("dark")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                studioTheme === "dark"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-neutral-400"
              }`}
            >
              <MoonIcon className="h-3.5 w-3.5 text-indigo-400" />
              Dark
            </button>
          </div>

          {/* Viewport Tab Switcher */}
          <div className="flex space-x-1 bg-slate-100 dark:bg-neutral-800 p-1 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                activeTab === "dashboard"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-neutral-300 hover:text-slate-900"
              }`}
            >
              <ComputerDesktopIcon className="h-4 w-4" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("login")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                activeTab === "login"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-neutral-300 hover:text-slate-900"
              }`}
            >
              <DevicePhoneMobileIcon className="h-4 w-4" />
              Login
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("email")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                activeTab === "email"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-neutral-300 hover:text-slate-900"
              }`}
            >
              <EnvelopeIcon className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("idcard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                activeTab === "idcard"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-neutral-300 hover:text-slate-900"
              }`}
            >
              <IdentificationIcon className="h-4 w-4" />
              ID Card
            </button>
          </div>
        </div>
      </div>

      {/* Preview Viewport Frame */}
      <div
        className={`min-h-[280px] rounded-2xl border p-6 flex items-center justify-center transition-colors relative overflow-hidden ${
          studioTheme === "light"
            ? "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/90 border-slate-200 text-slate-900"
            : "bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-neutral-950 border-neutral-800 text-white"
        }`}
      >
        {activeTab === "dashboard" && (
          <div
            className={`w-full max-w-md rounded-2xl overflow-hidden shadow-xl border transition-all ${
              studioTheme === "light"
                ? "bg-white border-slate-300"
                : "bg-neutral-900 border-neutral-800"
            }`}
          >
            <div
              className={`h-14 px-4 flex items-center justify-between border-b ${
                studioTheme === "light"
                  ? "bg-slate-50 border-slate-200 text-slate-800"
                  : "bg-neutral-950 border-neutral-800 text-white"
              }`}
            >
              <div className="h-8 max-w-[140px] flex items-center">
                <img src={brandLogo} alt="Brand Logo" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600">Active Tenant</span>
                <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 flex items-center justify-center font-bold text-[10px]">
                  AD
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="h-4 w-32 bg-slate-200 dark:bg-neutral-800 rounded-md" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 p-2 rounded-xl bg-slate-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-800 space-y-1">
                  <div className="h-3 w-16 bg-slate-300 dark:bg-neutral-700 rounded-xs" />
                  <div className="h-5 w-10 bg-teal-500/20 rounded-xs" />
                </div>
                <div className="h-14 p-2 rounded-xl bg-slate-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-800 space-y-1">
                  <div className="h-3 w-16 bg-slate-300 dark:bg-neutral-700 rounded-xs" />
                  <div className="h-5 w-10 bg-amber-500/20 rounded-xs" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "login" && (
          <div
            className="w-full max-w-sm rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 shadow-xl border border-white/20"
            style={{ backgroundColor: accentColor }}
          >
            <div className="h-12 w-36 flex items-center justify-center">
              <img src={brandLogo} alt="Login Logo" className="max-h-full max-w-full object-contain drop-shadow-md" />
            </div>
            <div
              className={`w-full p-5 rounded-xl shadow-lg space-y-3 ${
                studioTheme === "light" ? "bg-white text-slate-900" : "bg-neutral-900 text-white"
              }`}
            >
              <div className="text-center font-bold text-sm">Sign In to Your Account</div>
              <div className="h-9 w-full bg-slate-100 dark:bg-neutral-800 rounded-full border border-slate-200 dark:border-neutral-700 px-3 flex items-center text-xs text-slate-400">
                admin@church.org
              </div>
              <div
                className="h-9 w-full rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                Continue
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="w-full max-w-md bg-white text-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex flex-col items-center justify-center space-y-1.5 bg-slate-50">
              <img src={emailLogo} alt="Email Header Logo" className="h-10 max-w-[220px] object-contain" />
              <span className="text-[11px] text-slate-500 font-semibold">{tagline}</span>
            </div>
            <div className="p-5 text-xs space-y-3 text-slate-700 leading-relaxed">
              <p className="font-bold text-sm text-slate-900">Registration Confirmation</p>
              <p>Welcome to {orgName}! Your camper registration has been received and approved.</p>
              <div
                className="inline-block px-4 py-2 rounded-lg text-white font-bold text-xs shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                View Registration Details
              </div>
            </div>
          </div>
        )}

        {activeTab === "idcard" && (
          <div className="w-64 bg-white text-neutral-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-300 flex flex-col items-center p-5 space-y-3">
            <div className="h-9 w-full flex items-center justify-center border-b border-slate-100 pb-2">
              <img src={idCardLogo} alt="ID Card Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="h-20 w-20 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center font-bold text-slate-400 text-xs shadow-inner">
              PHOTO
            </div>
            <div className="text-center space-y-0.5">
              <p className="font-extrabold text-sm text-slate-900 tracking-tight">CAMPER NAME</p>
              <p className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">{orgName}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
