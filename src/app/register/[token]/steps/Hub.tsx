"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import type { WizardState, WizardAction } from "../types";

interface StepHubProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

function getStepForRegistration(status: string, fieldsComplete: boolean, documentsComplete: boolean): WizardState["step"] {
  if (status === "DRAFT" || status === "REQUIRES_ACTION") {
    if (!fieldsComplete) return "DETAILS";
    if (!documentsComplete) return "DOCUMENTS";
    return "REVIEW";
  }
  return "DETAILS"; // fallback
}

export function StepHub({ state, dispatch }: StepHubProps) {
  const { data: session } = useSession();
  const userEmail = state.email || session?.user?.email;
  const { data: registrations, isLoading } = api.registration.getByUserId.useQuery(
    undefined,
    { enabled: !!userEmail }
  );

  const campRegistrations = (registrations ?? []).filter(
    (r: any) => r.campId === state.campData?.campId && r.deletedAt === null
  );

  const incomplete = campRegistrations.filter(
    (r: any) => r.status === "DRAFT" || r.status === "REQUIRES_ACTION"
  );

  function resume(reg: any) {
    // Find or create the teen in wizard state
    const existingTeen = state.teens.find((t) => t.camperId === reg.camperId);
    if (!existingTeen) {
      dispatch({
        type: "ADD_TEEN",
        teen: {
          camperId: reg.camperId,
          registrationId: reg.id,
          firstName: reg.camper?.firstName ?? reg.camper?.name ?? "",
          lastName: reg.camper?.lastName ?? "",
          dateOfBirth: reg.camper?.dateOfBirth
            ? new Date(reg.camper.dateOfBirth).toISOString().split("T")[0]
            : "",
          gender: reg.camper?.gender ?? "",
          fieldsComplete: reg.camper?.fieldValues?.length > 0,
          documentsComplete: (reg.documents ?? []).length > 0,
        },
      });
    }
    dispatch({ type: "SET_ACTIVE_TEEN", camperId: reg.camperId });
    const target = getStepForRegistration(
      reg.status,
      reg.camper?.fieldValues?.length > 0,
      (reg.documents ?? []).filter((d: any) => d.status !== "REJECTED").length > 0
    );
    dispatch({ type: "GO_TO", step: target });
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <h1 className="mt-1 text-2xl font-bold text-txt-primary">
          Welcome{state.firstName ? `, ${state.firstName}` : ""}!
        </h1>
        <p className="text-sm text-txt-secondary">What would you like to do?</p>
      </div>

      <div className="space-y-4">
        {/* Card 1: Register a Teen */}
        <button
          type="button"
          onClick={() => dispatch({ type: "GO_TO", step: "TEENS" })}
          className="flex w-full items-center gap-4 rounded-2xl border border-border-default bg-surface p-5 text-left shadow-sm transition-colors hover:border-accent-300 hover:shadow-md"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-txt-primary">Register a Teen</h3>
            <p className="text-xs text-txt-secondary">Add a new teen to this camp.</p>
          </div>
          <svg className="h-5 w-5 shrink-0 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Card 2: Resume Registration */}
        {isLoading ? (
          <div className="animate-pulse rounded-2xl border border-border-default bg-surface p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-neutral-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-neutral-200" />
                <div className="h-3 w-48 rounded bg-surface-raised" />
              </div>
            </div>
          </div>
        ) : incomplete.length > 0 ? (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-txt-muted">
              Incomplete Registrations
            </p>
            {incomplete.map((reg: any) => (
              <button
                key={reg.id}
                type="button"
                onClick={() => resume(reg)}
                className="flex w-full items-center gap-4 rounded-2xl border border-warning-200 bg-warning-50 p-5 text-left shadow-sm transition-colors hover:border-warning-300 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning-100 text-warning-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-txt-primary truncate">
                    Resume: {reg.camper?.firstName ?? reg.camper?.name ?? "Camper"}
                  </h3>
                  <p className="text-xs text-txt-secondary">
                    {reg.status === "REQUIRES_ACTION" ? "Action needed" : "Incomplete"} · {reg.camp?.name}
                  </p>
                </div>
                <svg className="h-5 w-5 shrink-0 text-warning-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        ) : null}

        {/* Card 3: View Status */}
        <a
          href="/dashboard"
          className="flex w-full items-center gap-4 rounded-2xl border border-border-default bg-surface p-5 text-left shadow-sm transition-colors hover:border-input-border hover:shadow-md"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-txt-secondary">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 8.25h-2.25A2.25 2.25 0 0 1 13.5 6V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-txt-primary">View Status</h3>
            <p className="text-xs text-txt-secondary">Check your registrations and acceptance letters.</p>
          </div>
          <svg className="h-5 w-5 shrink-0 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </a>
      </div>
    </div>
  );
}
