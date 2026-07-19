"use client";

import { useEffect } from "react";
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";

interface SuccessOverlayProps {
  camperName: string;
  regNumber: string;
  tribe?: string | null;
  room?: string | null;
  bed?: string | null;
  teacherName?: string | null;
  hostel?: string | null;
  onDismiss: () => void;
  duration?: number;
}

export function SuccessOverlay({
  camperName,
  regNumber,
  tribe,
  room,
  bed,
  teacherName,
  hostel,
  onDismiss,
  duration = 2000,
}: SuccessOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-600 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white cursor-pointer animate-fade-in transition-all"
    >
      <div className="flex flex-col items-center max-w-lg text-center space-y-6">
        <CheckCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-bounce" />
        
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">✓ Checked In</h1>
          <p className="text-2xl md:text-3xl font-bold opacity-90">{camperName}</p>
          <p className="text-sm font-semibold tracking-wider opacity-75 uppercase">{regNumber}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full bg-white/10 backdrop-blur rounded-xl p-4 text-left text-sm md:text-base border border-white/10">
          <div>
            <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Tribe</span>
            <span className="font-bold">{tribe || "—"}</span>
          </div>
          <div>
            <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Hostel</span>
            <span className="font-bold">{hostel || "—"}</span>
          </div>
          <div>
            <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Room & Bed</span>
            <span className="font-bold">{room ? `${room} / ${bed || "—"}` : "—"}</span>
          </div>
          <div>
            <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Teacher</span>
            <span className="font-bold">{teacherName || "—"}</span>
          </div>
        </div>

        <p className="text-xs opacity-60">Tapping anywhere will skip and return to scanning</p>
      </div>
    </div>
  );
}

interface ErrorOverlayProps {
  title?: string;
  message: string;
  onDismiss: () => void;
}

export function ErrorOverlay({ title = "Check-in Failed", message, onDismiss }: ErrorOverlayProps) {
  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-rose-600 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white cursor-pointer animate-fade-in"
    >
      <div className="flex flex-col items-center max-w-md text-center space-y-6">
        <XCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-pulse" />

        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">{title}</h1>
          <p className="text-xl md:text-2xl font-semibold opacity-95">{message}</p>
        </div>

        <div className="pt-4 w-full">
          <Button
            size="lg"
            className="w-full bg-white text-rose-700 hover:bg-neutral-100 font-bold py-4 text-lg border-none"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
          >
            Dismiss & Resume Scanning
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MedicalOverlayProps {
  camperName: string;
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  dietaryRestrictions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  relationship?: string | null;
  parentPhone?: string | null;
  teenPhone?: string | null;
  onAcknowledge: () => void;
  onCancel: () => void;
}

export function MedicalOverlay({
  camperName,
  allergies,
  medicalConditions,
  medications,
  dietaryRestrictions,
  emergencyContactName,
  emergencyContactPhone,
  relationship,
  parentPhone,
  teenPhone,
  onAcknowledge,
  onCancel,
}: MedicalOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-600 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white overflow-y-auto">
      <div className="flex flex-col max-w-xl w-full text-center space-y-6 py-6">
        <div className="flex flex-col items-center space-y-3">
          <ExclamationTriangleIcon className="h-20 w-20 md:h-24 md:w-24 text-amber-100 animate-bounce" />
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">⚠ Medical & Safety Alert</h1>
          <p className="text-xl md:text-2xl font-bold opacity-95">{camperName}</p>
        </div>

        <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-left space-y-4 border border-white/10 text-sm md:text-base">
          {allergies && (
            <div>
              <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Allergies</span>
              <span className="font-bold text-lg text-amber-50">{allergies}</span>
            </div>
          )}
          {medicalConditions && (
            <div>
              <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Medical Conditions</span>
              <span className="font-bold text-lg text-amber-50">{medicalConditions}</span>
            </div>
          )}
          {medications && (
            <div>
              <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Medications</span>
              <span className="font-bold">{medications}</span>
            </div>
          )}
          {dietaryRestrictions && (
            <div>
              <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Dietary Restrictions</span>
              <span className="font-bold">{dietaryRestrictions}</span>
            </div>
          )}

          {(emergencyContactName || parentPhone || teenPhone) && (
            <div className="border-t border-white/20 pt-3 mt-3">
              <span className="block text-xs uppercase opacity-75 font-semibold mb-2 text-white/80">Emergency Contacts</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm">
                {emergencyContactName && (
                  <div>
                    <span className="opacity-75">{relationship ?? "Emergency"}:</span>{" "}
                    <span className="font-bold">{emergencyContactName} {emergencyContactPhone ? `(${emergencyContactPhone})` : ""}</span>
                  </div>
                )}
                {parentPhone && (
                  <div>
                    <span className="opacity-75">Parent Phone:</span> <span className="font-bold">{parentPhone}</span>
                  </div>
                )}
                {teenPhone && (
                  <div>
                    <span className="opacity-75">Teen Phone:</span> <span className="font-bold">{teenPhone}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full">
          <Button
            size="lg"
            className="flex-1 bg-white text-amber-700 hover:bg-neutral-100 font-bold py-4 text-base border-none shadow-lg"
            onClick={onAcknowledge}
          >
            Acknowledge & Confirm Check-in
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="flex-1 bg-transparent hover:bg-white/10 text-white font-bold py-4 text-base border border-white/40"
            onClick={onCancel}
          >
            Cancel & Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
