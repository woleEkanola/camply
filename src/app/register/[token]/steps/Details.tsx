"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "@/utils/trpc";
import type { WizardState, WizardAction } from "../types";
import { TeenSwitcher } from "../components/TeenSwitcher";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";
import { AutoSaveIndicator } from "../components/AutoSaveIndicator";

interface StepDetailsProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function StepDetails({ state, dispatch }: StepDetailsProps) {
  const activeTeen = state.teens.find((t) => t.camperId === state.activeTeenId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFieldUploadingChange = useCallback((key: string, uploading: boolean) => {
    setUploadingKeys((prev) => {
      const next = new Set(prev);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const isUploading = uploadingKeys.size > 0;

  const updateCamper = api.camper.update.useMutation();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { data: fields } = api.formField.list.useQuery(
    {
      organizationId: state.campData?.organizationId ?? "",
      audience: "CAMPER",
      campId: state.campData?.campId,
    },
    { enabled: !!state.campData?.organizationId }
  );

  const { data: camperData } = api.camper.getById.useQuery(
    { id: activeTeen?.camperId ?? "" },
    { enabled: !!activeTeen?.camperId }
  );

  const visibleFields = useMemo(() => {
    return (fields ?? [])
      .filter((f: FormFieldDTO) => f.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [fields]);

  useEffect(() => {
    if (camperData && !loaded) {
      const initial: Record<string, unknown> = {
        firstName: activeTeen?.firstName ?? "",
        lastName: activeTeen?.lastName ?? "",
        dateOfBirth: activeTeen?.dateOfBirth ?? "",
        gender: activeTeen?.gender ?? "",
      };
      if (camperData.fieldValues) {
        for (const fv of camperData.fieldValues as any[]) {
          const key = fv.field?.systemKey ?? fv.fieldId;
          if (fv.value) initial[key] = fv.value;
        }
      }
      setValues(initial);
      setLoaded(true);
    }
  }, [camperData, loaded, activeTeen]);

  useEffect(() => {
    setLoaded(false);
    setUploadingKeys(new Set());
  }, [activeTeen?.camperId]);

  function persistToBackend(newValues: Record<string, unknown>) {
    if (!activeTeen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");

    debounceRef.current = setTimeout(async () => {
      try {
        const profile: Record<string, unknown> = {};
        const fieldValues: { fieldId: string; value: string }[] = [];

        for (const f of visibleFields) {
          const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
          const val = newValues[key];
          if (val !== undefined && val !== null && String(val) !== "") {
            if (f.source === "SYSTEM" && f.systemKey) {
              profile[f.systemKey] = val;
            }
            fieldValues.push({ fieldId: f.id, value: String(val) });
          }
        }

        await updateCamper.mutateAsync({
          id: activeTeen.camperId,
          profile,
          fieldValues,
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1200);
  }

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      setFieldErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return prev;
      });
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        persistToBackend(next);
        return next;
      });
    },
    [activeTeen, visibleFields]
  );

  async function handleNext() {
    if (!activeTeen) return;
    if (isUploading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Validate required fields
    const errors: Record<string, string> = {};
    for (const f of visibleFields) {
      if (!f.required) continue;
      const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
      const val = values[key];
      if (
        val === undefined ||
        val === null ||
        String(val).trim() === "" ||
        (Array.isArray(val) && val.length === 0)
      ) {
        errors[key] = `${f.label} is required`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Final save before navigating
    const profile: Record<string, unknown> = {};
    const fieldValues: { fieldId: string; value: string }[] = [];

    for (const f of visibleFields) {
      const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
      const val = values[key];
      if (val !== undefined && val !== null && String(val) !== "") {
        if (f.source === "SYSTEM" && f.systemKey) {
          profile[f.systemKey] = val;
        }
        fieldValues.push({ fieldId: f.id, value: String(val) });
      }
    }

    try {
      await updateCamper.mutateAsync({ id: activeTeen.camperId, profile, fieldValues });
    } catch {}

    dispatch({
      type: "SET_TEEN_COMPLETE",
      camperId: activeTeen.camperId,
      fieldsComplete: true,
      documentsComplete: activeTeen.documentsComplete,
    });

    dispatch({ type: "GO_TO", step: "DOCUMENTS" });
  }

  if (!activeTeen) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-neutral-500">No teen selected.</p>
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="mt-3 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <TeenSwitcher
          teens={state.teens}
          activeTeenId={state.activeTeenId}
          onChange={(id) => dispatch({ type: "SET_ACTIVE_TEEN", camperId: id })}
        />
        <h1 className="text-xl font-bold text-neutral-900">{activeTeen.firstName} {activeTeen.lastName}</h1>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {!fields ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-neutral-200" />
                <div className="h-10 rounded-xl bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : visibleFields.length === 0 ? (
          <p className="text-sm text-neutral-500">No fields configured.</p>
        ) : (
          <DynamicFieldGroup
            fields={visibleFields}
            values={values}
            onChange={handleChange}
            errors={fieldErrors}
            onFieldUploadingChange={handleFieldUploadingChange}
          />
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="min-w-[110px]">
            <AutoSaveIndicator status={saveStatus} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => dispatch({ type: "GO_BACK" })}
                className="flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleNext}
                className="flex h-12 items-center gap-1 rounded-xl bg-accent-600 px-6 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent-600"
              >
                Next
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
            {isUploading && (
              <p className="text-xs text-neutral-500">Please wait for uploads to finish.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <a href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-600 underline">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
