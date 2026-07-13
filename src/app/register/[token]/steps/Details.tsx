"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/utils/trpc";
import type { WizardState, WizardAction } from "../types";
import { TeenSwitcher } from "../components/TeenSwitcher";
import { FieldRenderer } from "../components/FieldRenderer";
import { AutoSaveIndicator } from "../components/AutoSaveIndicator";

const SECTIONS = ["Camper Information", "Medical & Emergency", "Education & Church"];

interface StepDetailsProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function StepDetails({ state, dispatch }: StepDetailsProps) {
  const activeTeen = state.teens.find((t) => t.camperId === state.activeTeenId);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (camperData && !loaded) {
      const initial: Record<string, string> = {
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
  }, [activeTeen?.camperId]);

  const sectionFields = (fields ?? []).filter(
    (f) => f.visible && f.groupLabel === SECTIONS[sectionIndex]
  );

  function persistToBackend(newValues: Record<string, string>) {
    if (!activeTeen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");

    debounceRef.current = setTimeout(async () => {
      try {
        const fieldValues = (fields ?? [])
          .filter((f) => f.visible)
          .map((f) => {
            const key = f.systemKey ?? f.id;
            return { fieldId: f.id, value: newValues[key] ?? "" };
          })
          .filter((fv) => fv.value);

        await updateCamper.mutateAsync({
          id: activeTeen.camperId,
          profile: {},
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
    (key: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        persistToBackend(next);
        return next;
      });
    },
    [activeTeen, fields]
  );

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

  const isLastSection = sectionIndex === SECTIONS.length - 1;

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <TeenSwitcher
          teens={state.teens}
          activeTeenId={state.activeTeenId}
          onChange={(id) => dispatch({ type: "SET_ACTIVE_TEEN", camperId: id })}
        />
        <h1 className="text-xl font-bold text-neutral-900">{activeTeen.firstName} {activeTeen.lastName}</h1>
      </div>

      <div className="mb-5 flex gap-1" role="tablist" aria-label="Sections">
        {SECTIONS.map((s, i) => (
          <button
            key={s}
            role="tab"
            aria-selected={i === sectionIndex}
            onClick={() => setSectionIndex(i)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              i === sectionIndex
                ? "bg-accent-600 text-white"
                : i < sectionIndex
                  ? "bg-accent-100 text-accent-700"
                  : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {s.replace(" & ", "/").split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">{SECTIONS[sectionIndex]}</h2>

        {!fields ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-neutral-200" />
                <div className="h-10 rounded-xl bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : sectionFields.length === 0 ? (
          <p className="text-sm text-neutral-500">No fields in this section.</p>
        ) : (
          <div className="space-y-4">
            {sectionFields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={values[field.systemKey ?? field.id] ?? ""}
                onChange={(v) => handleChange(field.systemKey ?? field.id, v)}
                registrationId={activeTeen.registrationId}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="min-w-[110px]">
            <AutoSaveIndicator status={saveStatus} />
          </div>
          <div className="flex gap-3">
            {sectionIndex > 0 && (
              <button
                type="button"
                onClick={() => setSectionIndex((i) => i - 1)}
                className="flex h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                ← Previous
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                dispatch({
                  type: "SET_TEEN_COMPLETE",
                  camperId: activeTeen.camperId,
                  fieldsComplete: true,
                  documentsComplete: activeTeen.documentsComplete,
                });
                if (isLastSection) {
                  dispatch({ type: "GO_TO", step: "DOCUMENTS" });
                } else {
                  setSectionIndex((i) => i + 1);
                }
              }}
              className="flex h-11 items-center gap-1 rounded-xl bg-accent-600 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              {isLastSection ? "Continue to Documents" : "Next"}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
