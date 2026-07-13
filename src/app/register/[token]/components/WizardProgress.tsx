"use client";

import { cn } from "@/lib/cn";
import type { WizardStep } from "../types";
import { STEP_LABELS } from "../types";

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: WizardStep;
  currentStepIndex: number;
}

export function WizardProgress({ steps, currentStepIndex }: WizardProgressProps) {
  return (
    <nav aria-label="Registration progress" className="mb-8">
      <ol className="flex items-center gap-1">
        {steps.map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          return (
            <li key={step} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex h-2 flex-1 rounded-full",
                  isComplete || isCurrent ? "bg-accent-600" : "bg-neutral-200"
                )}
              />
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isComplete ? "bg-accent-600" : "bg-neutral-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-xs font-medium text-neutral-500">
        Step {currentStepIndex + 1} of {steps.length}
      </p>
    </nav>
  );
}
