"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { WizardState, WizardAction } from "../types";
import { api } from "@/utils/trpc";

interface StepReviewProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

function TeenReviewCard({
  teen,
  organizationId,
  campId,
  dispatch,
}: {
  teen: WizardState["teens"][0];
  organizationId: string;
  campId: string;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { data: camper } = api.camper.getById.useQuery(
    { id: teen.camperId },
    { enabled: !!teen.camperId }
  );

  const { data: fields } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER", campId },
    { enabled: !!organizationId }
  );

  const { data: docs } = api.document.listForRegistration.useQuery(
    { registrationId: teen.registrationId },
    { enabled: !!teen.registrationId }
  );

  const { data: requirements } = api.documentRequirement.listByCamp.useQuery(
    { campId },
    { enabled: !!campId }
  );

  const formattedDob = useMemo(() => {
    if (!teen.dateOfBirth) return null;
    try {
      return format(parseISO(teen.dateOfBirth), "MMMM d, yyyy");
    } catch {
      return teen.dateOfBirth;
    }
  }, [teen.dateOfBirth]);

  const photoUrl =
    camper?.fieldValues
      ?.find(
        (fv: any) =>
          fv.field?.type === "FILE" &&
          fv.field?.systemKey === "photoUrl" &&
          fv.value
      )
      ?.value ?? null;

  const fieldEntries = useMemo(() => {
    if (!camper || !fields) return [];
    const visibleFields = fields.filter((f: any) => f.visible);
    return visibleFields.map((field: any) => {
      let value: string | undefined;

      const fv = camper.fieldValues?.find((f: any) => f.fieldId === field.id);
      if (fv?.value) {
        value = fv.value;
      }

      if (!value && field.source === "SYSTEM" && field.systemKey) {
        const raw = (camper as any)[field.systemKey];
        if (raw !== undefined && raw !== null) {
          value = typeof raw === "string" ? raw : String(raw);
        }
      }

      if (value && field.type === "DATE") {
        try {
          value = format(parseISO(value), "MMMM d, yyyy");
        } catch {}
      }

      return { label: field.label, value: value || "" };
    });
  }, [camper, fields]);

  return (
    <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg className="h-6 w-6 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="break-words font-semibold text-neutral-900 [overflow-wrap:anywhere]">
              {teen.firstName} {teen.lastName}
            </h3>
            <p className="break-words text-xs text-neutral-500 [overflow-wrap:anywhere]">
              {formattedDob || "No DOB"}
              {teen.gender ? ` · ${teen.gender}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              teen.fieldsComplete && teen.documentsComplete
                ? "bg-success-100 text-success-700"
                : "bg-warning-100 text-warning-700"
            }`}
          >
            {teen.fieldsComplete && teen.documentsComplete ? "Complete" : "Incomplete"}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "GO_TO_EDIT", camperId: teen.camperId })}
            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Edit profile"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Profile fields grid */}
      <div className="mb-4 min-w-0 rounded-lg bg-neutral-50 p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Profile Information
        </h4>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {fieldEntries.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <div className="break-words text-neutral-500 [overflow-wrap:anywhere]">{label}:</div>
              <div className="break-words font-medium text-neutral-900 [overflow-wrap:anywhere]">
                {value || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents summary */}
      {requirements && requirements.length > 0 && (
        <div className="min-w-0 rounded-lg bg-neutral-50 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Documents
          </h4>
          <div className="space-y-1.5 text-sm">
            {requirements.map((req: any) => {
              const doc = (docs ?? []).find(
                (d: any) => d.requirementId === req.id && d.status !== "REJECTED"
              );
              return (
                <div key={req.id} className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-neutral-500 [overflow-wrap:anywhere]">{req.name}:</span>
                  {doc ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-accent-600 underline hover:text-accent-700"
                    >
                      View
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs italic text-neutral-400">Not uploaded</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function StepReview({ state, dispatch }: StepReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const submitRef = useRef(false);

  const submitRegistration = api.registration.submit.useMutation();
  const { data: declarations } = api.registrationConfig.listDeclarations.useQuery(
    { organizationId: state.campData?.organizationId ?? "" },
    { enabled: !!state.campData?.organizationId }
  );

  // Sync fetched declarations into wizard state
  useEffect(() => {
    if (declarations && declarations.length > 0) {
      dispatch({ type: "SET_DECLARATIONS", declarations });
    }
  }, [declarations, dispatch]);

  const requiredDeclarations = declarations?.filter((d) => d.required) ?? [];
  const allDeclared =
    requiredDeclarations.length === 0 ||
    requiredDeclarations.every((d) =>
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

      {/* Camp Overview */}
      <div className="mb-6 min-w-0 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Camp</h3>
        <p className="break-words text-sm font-medium text-neutral-900 [overflow-wrap:anywhere]">{state.campData?.campName}</p>
        <p className="break-words text-xs text-neutral-500 [overflow-wrap:anywhere]">
          {state.campData?.organizationName} · {state.campData?.campusName}
          {state.campData?.year ? ` · ${state.campData?.year}` : ""}
        </p>
      </div>

      {/* Teen Cards */}
      <div className="mb-6 space-y-3">
        {state.teens.map((teen) => (
          <TeenReviewCard
            key={teen.camperId}
            teen={teen}
            organizationId={state.campData?.organizationId ?? ""}
            campId={state.campData?.campId ?? ""}
            dispatch={dispatch}
          />
        ))}
      </div>

      {/* Consent Declarations */}
      {declarations && declarations.length > 0 && (
        <div className="mb-6 min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Consent</h3>
          <div className="space-y-3">
            {declarations.map((d) => (
              <label key={d.id} className="flex min-w-0 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={state.declarations.find((sd) => sd.id === d.id)?.checked ?? false}
                  onChange={(e) => {
                    dispatch({ type: "SET_DECLARATION", id: d.id, checked: e.target.checked });
                    setErrors([]);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-accent-600"
                />
                <span className="min-w-0 break-words text-sm text-neutral-700 [overflow-wrap:anywhere]">{d.label}</span>
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
