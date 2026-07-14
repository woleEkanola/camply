"use client";

import { useState, useRef, useMemo } from "react";
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
  const [expanded, setExpanded] = useState(false);

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

  const photoUrl =
    camper?.fieldValues
      ?.find(
        (fv: any) =>
          fv.field?.type === "FILE" &&
          fv.field?.systemKey === "photoUrl" &&
          fv.value
      )
      ?.value ?? null;

  const groupedFields = useMemo(() => {
    if (!camper || !fields) return [];

    const visibleFields = fields.filter((f: any) => f.visible);
    const grouped: Record<string, { label: string; value: string }[]> = {};

    for (const field of visibleFields) {
      let value: string | undefined;
      if (field.source === "SYSTEM" && field.systemKey) {
        const raw = (camper as any)[field.systemKey];
        if (raw !== undefined && raw !== null) {
          value = typeof raw === "string" ? raw : String(raw);
        }
      } else {
        value = camper.fieldValues?.find((fv: any) => fv.fieldId === field.id)?.value;
      }
      if (!value) continue;
      const section = field.groupLabel || "Other";
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push({ label: field.label, value });
    }

    return Object.entries(grouped);
  }, [camper, fields]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg className="h-6 w-6 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-neutral-900">
            {teen.firstName} {teen.lastName}
          </p>
          <p className="text-xs text-neutral-500">
            {teen.dateOfBirth || "No DOB"}
            {teen.gender ? ` · ${teen.gender}` : ""}
          </p>
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
          <svg
            className={`h-4 w-4 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-5 py-4">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-neutral-300">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                  </svg>
                  <span className="text-[10px] font-medium">No photo</span>
                </div>
              )}
            </div>
          </div>

          {groupedFields.map(([section, items]) => (
            <div key={section} className="mb-4 last:mb-0">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{section}</h4>
              <dl className="space-y-1.5 text-sm">
                {items.map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="font-medium text-neutral-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          {docs && docs.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Documents</h4>
              <div className="space-y-1.5 text-sm">
                {docs.map((doc: any) => {
                  const reqName = requirements?.find((r: any) => r.id === doc.requirementId)?.name ?? "Document";
                  return (
                    <div key={doc.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">{reqName}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${
                          doc.status === "APPROVED" ? "bg-success-100 text-success-700" :
                          doc.status === "REJECTED" ? "bg-danger-100 text-danger-700" :
                          "bg-neutral-200 text-neutral-600"
                        }`}>
                          {doc.status}
                        </span>
                      </div>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:underline truncate ml-2 max-w-[120px]">
                        {doc.fileName}
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => dispatch({ type: "GO_TO_EDIT", camperId: teen.camperId })}
            className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            Edit Profile
          </button>
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
        <p className="text-xs text-neutral-500">{state.campData?.campusName} · {state.campData?.year}</p>
      </div>

      <div className="mb-6 space-y-3">
        {state.teens.map((teen) => (
          <TeenReviewCard key={teen.camperId} teen={teen} organizationId={state.campData?.organizationId ?? ""} campId={state.campData?.campId ?? ""} dispatch={dispatch} />
        ))}
      </div>

      {declarations && declarations.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Consent</h3>
          <div className="space-y-3">
            {declarations.map((d) => (
              <label key={d.id} className="flex items-start gap-3 cursor-pointer">
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
