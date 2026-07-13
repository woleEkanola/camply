"use client";

import { useState, useRef } from "react";
import type { WizardState, WizardAction } from "../types";
import { api } from "@/utils/trpc";

interface StepReviewProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function StepReview({ state, dispatch }: StepReviewProps) {
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const submitRef = useRef(false);

  const submitRegistration = api.registration.submit.useMutation();
  const { data: config } = api.registrationConfig.getConfig.useQuery(
    { organizationId: state.campData?.organizationId ?? "" },
    { enabled: !!state.campData?.organizationId }
  );
  const { data: declarations } = api.registrationConfig.listDeclarations.useQuery(
    { organizationId: state.campData?.organizationId ?? "" },
    { enabled: !!state.campData?.organizationId }
  );

  const allDeclared =
    !declarations?.length ||
    declarations.every((d) =>
      state.declarations.find((sd) => sd.id === d.id)?.checked
    );

  async function handleSubmit() {
    if (submitRef.current) return;
    setErrors([]);
    if (!allDeclared) {
      setErrors(["Please accept all required declarations."]);
      return;
    }

    submitRef.current = true;
    setSubmitting(true);
    const results = await Promise.allSettled(
      state.teens.map((teen) =>
        submitRegistration.mutateAsync({ registrationId: teen.registrationId })
      )
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      setErrors(failed.map((f: any) => f.reason?.message ?? "Submission failed"));
      setSubmitting(false);
      submitRef.current = false;
      return;
    }

    dispatch({ type: "GO_TO", step: "CONFIRMATION" });
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-neutral-900">Review Your Registration</h1>
      </div>

      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-neutral-700">{state.campData?.campName}</p>
        <p className="text-xs text-neutral-500">{state.campData?.campusName}</p>
      </div>

      <div className="mb-6 space-y-2">
        {state.teens.map((teen) => (
          <div key={teen.camperId} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setExpandedChild(expandedChild === teen.camperId ? null : teen.camperId)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <div>
                <p className="font-medium text-neutral-900">{teen.firstName} {teen.lastName}</p>
                <p className="text-xs text-neutral-500">
                  {teen.dateOfBirth || "No DOB"}{teen.gender ? ` · ${teen.gender}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  teen.fieldsComplete && teen.documentsComplete
                    ? "bg-success-100 text-success-700"
                    : "bg-warning-100 text-warning-700"
                }`}>
                  {teen.fieldsComplete && teen.documentsComplete ? "Complete" : "Incomplete"}
                </span>
                <svg
                  className={`h-4 w-4 text-neutral-400 transition-transform ${expandedChild === teen.camperId ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>
            {expandedChild === teen.camperId && (
              <div className="border-t border-neutral-100 px-5 py-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Name</dt>
                    <dd className="font-medium text-neutral-900">{teen.firstName} {teen.lastName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Date of Birth</dt>
                    <dd className="font-medium text-neutral-900">{teen.dateOfBirth || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Gender</dt>
                    <dd className="font-medium text-neutral-900">{teen.gender || "—"}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        ))}
      </div>

      {declarations && declarations.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Consent</h3>
          <div className="space-y-3">
            {declarations.map((d) => (
              <label
                key={d.id}
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={state.declarations.find((sd) => sd.id === d.id)?.checked ?? false}
                  onChange={(e) =>
                    dispatch({ type: "SET_DECLARATION", id: d.id, checked: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-accent-600"
                />
                <span className="text-sm text-neutral-700">{d.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg bg-danger-50 px-4 py-3">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-danger-700">{e}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || submitRef.current}
        onClick={handleSubmit}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          "Submit Registration"
        )}
      </button>
    </div>
  );
}
