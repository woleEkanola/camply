"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import type { WizardState, WizardAction, TeenRegistration } from "../types";
import { TeenCard } from "../components/TeenCard";
import { TeenEntryForm } from "../components/TeenEntryForm";

interface StepTeensProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function StepTeens({ state, dispatch }: StepTeensProps) {
  const [showAdd, setShowAdd] = useState(state.teens.length === 0);
  const [addingTeen, setAddingTeen] = useState(false);

  const createDraft = api.registration.createDraft.useMutation();

  async function handleAddTeen(data: { firstName: string; lastName: string; dateOfBirth: string; gender: string }) {
    setAddingTeen(true);
    try {
      const payload = {
        email: state.email,
        name: `${data.firstName} ${data.lastName}`.trim(),
        firstName: data.firstName,
        lastName: data.lastName,
        dob: data.dateOfBirth || undefined,
        gender: data.gender || undefined,
        token: state.token,
        fieldValues: [] as { fieldId: string; value: string }[],
      };

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message ?? "Failed to add teen");

      const draft = await createDraft.mutateAsync({
        camperId: result.camperId,
        campId: state.campData!.campId,
        campusId: state.campData!.campusId,
      });

      const teen: TeenRegistration = {
        camperId: result.camperId,
        registrationId: draft.id,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        fieldsComplete: false,
        documentsComplete: false,
      };

      dispatch({ type: "ADD_TEEN", teen });
      setShowAdd(false);
    } catch (err: any) {
      alert(err.message ?? "Could not add teen. Please try again.");
    } finally {
      setAddingTeen(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-neutral-900">Your Teens</h1>
        <p className="mt-1 text-sm text-neutral-500">Who&apos;s coming to camp?</p>
      </div>

      {state.teens.length > 0 && (
        <div className="mb-4 space-y-2">
          {state.teens.map((teen) => (
            <TeenCard
              key={teen.camperId}
              teen={teen}
              isActive={state.activeTeenId === teen.camperId}
              onClick={() => dispatch({ type: "SET_ACTIVE_TEEN", camperId: teen.camperId })}
              onRemove={() => {
                if (confirm(`Remove ${teen.firstName} ${teen.lastName}?`)) {
                  dispatch({ type: "REMOVE_TEEN", camperId: teen.camperId });
                }
              }}
            />
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-neutral-900">
            {state.teens.length === 0 ? "Add Your Teen" : "Add Another Teen"}
          </h2>
          <TeenEntryForm
            onSubmit={handleAddTeen}
            onCancel={state.teens.length > 0 ? () => setShowAdd(false) : undefined}
            loading={addingTeen}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-4 text-sm font-medium text-neutral-600 transition-colors hover:border-accent-400 hover:text-accent-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Another Teen
        </button>
      )}

      {state.teens.length > 0 && !showAdd && (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "SET_ACTIVE_TEEN", camperId: state.teens[0]?.camperId ?? null });
            dispatch({ type: "GO_TO", step: "DETAILS" });
          }}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        >
          Continue to Registration
        </button>
      )}
    </div>
  );
}
