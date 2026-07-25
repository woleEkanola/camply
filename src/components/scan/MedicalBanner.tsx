"use client";

interface MedicalBannerProps {
  flags: string[];
  camper: {
    allergies?: string | null;
    medicalConditions?: string | null;
    medications?: string | null;
    dietaryRestrictions?: string | null;
  };
}

const FLAG_LABELS: Record<string, string> = {
  allergies: "Allergies",
  medicalConditions: "Medical Conditions",
  medications: "Medications",
  dietaryRestrictions: "Dietary Restrictions",
};

/**
 * Non-critical medical info rendered inline inside the normal result card —
 * routine allergy/dietary notes shouldn't interrupt scanning. Only
 * CRITICAL cases (see src/lib/medical.ts) get a full-screen interrupt.
 */
export function MedicalBanner({ flags, camper }: MedicalBannerProps) {
  if (flags.length === 0) return null;

  return (
    <div className="w-full rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-left animate-fade-in">
      <span className="block text-xs font-black uppercase tracking-wide text-red-100">⚠ Medical Note</span>
      <div className="mt-1 space-y-0.5">
        {flags.map((flag) => (
          <p key={flag} className="text-sm font-semibold text-white">
            {FLAG_LABELS[flag] ?? flag}: {(camper as Record<string, unknown>)[flag] as string}
          </p>
        ))}
      </div>
    </div>
  );
}
