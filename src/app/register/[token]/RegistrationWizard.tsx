"use client";

import { useReducer, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import type { WizardState, WizardAction } from "./types";
import { VISIBLE_STEPS } from "./types";
import { WizardProgress } from "./components/WizardProgress";
import { StepLanding } from "./steps/Landing";
import { StepIdentity } from "./steps/Identity";
import { StepTeens } from "./steps/Teens";
import { StepDetails } from "./steps/Details";
import { StepDocuments } from "./steps/Documents";
import { StepReview } from "./steps/Review";
import { StepConfirmation } from "./steps/Confirmation";

const STORAGE_KEY = "camply-registration-wizard";

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_CAMP_DATA":
      return { ...state, campData: action.data, step: "LANDING" };
    case "SET_EMAIL":
      return { ...state, email: action.email };
    case "SET_IS_NEW_USER":
      return { ...state, isNewUser: action.isNewUser };
    case "SET_NAMES":
      return { ...state, firstName: action.firstName, lastName: action.lastName };
    case "SET_AUTH_METHOD":
      return { ...state, authMethod: action.method };
    case "GO_TO":
      return {
        ...state,
        previousStep: state.step,
        step: action.step,
        direction: "forward",
      };
    case "GO_BACK": {
      if (state.returnTo) {
        const target = state.returnTo;
        return {
          ...state,
          step: target,
          previousStep: state.step,
          direction: "backward",
          returnTo: undefined,
        };
      }
      const backMap: Partial<Record<WizardState["step"], WizardState["step"]>> = {
        IDENTITY: "LANDING",
        NEW_ACCOUNT: "IDENTITY",
        RETURNING_USER: "IDENTITY",
        TEENS: "IDENTITY",
        DETAILS: "TEENS",
        DOCUMENTS: "DETAILS",
        REVIEW: "DOCUMENTS",
      };
      const prev = backMap[state.step] ?? state.previousStep;
      return {
        ...state,
        step: prev ?? "LANDING",
        previousStep: state.step,
        direction: "backward",
      };
    }
    case "GO_TO_EDIT":
      return {
        ...state,
        activeTeenId: action.camperId,
        returnTo: "REVIEW",
        previousStep: state.step,
        step: "DETAILS",
        direction: "backward",
      };
    case "ADD_TEEN":
      return {
        ...state,
        teens: [...state.teens, action.teen],
        activeTeenId: action.teen.camperId,
      };
    case "REMOVE_TEEN":
      return {
        ...state,
        teens: state.teens.filter((t) => t.camperId !== action.camperId),
        activeTeenId:
          state.activeTeenId === action.camperId
            ? state.teens[0]?.camperId ?? null
            : state.activeTeenId,
      };
    case "SET_ACTIVE_TEEN":
      return { ...state, activeTeenId: action.camperId };
    case "SET_TEEN_COMPLETE":
      return {
        ...state,
        teens: state.teens.map((t) =>
          t.camperId === action.camperId
            ? { ...t, fieldsComplete: action.fieldsComplete, documentsComplete: action.documentsComplete }
            : t
        ),
      };
    case "SET_DECLARATION":
      return {
        ...state,
        declarations: state.declarations.map((d) =>
          d.id === action.id ? { ...d, checked: action.checked } : d
        ),
      };
    case "SET_ERROR":
      return { ...state, step: "ERROR", error: { title: action.title, message: action.message } };
    case "CLEAR_ERROR":
      return { ...state, step: state.previousStep ?? "LANDING", error: null };
    default:
      return state;
  }
}

function createInitialState(token: string): WizardState {
  return {
    step: "LOADING",
    previousStep: null,
    direction: "forward",
    token,
    campData: null,
    email: "",
    isNewUser: null,
    firstName: "",
    lastName: "",
    authMethod: "password",
    teens: [],
    activeTeenId: null,
    declarations: [],
    error: null,
    returnTo: undefined,
  };
}

export function RegistrationWizard({ token }: { token: string }) {
  const [state, dispatch] = useReducer(wizardReducer, token, createInitialState);
  const router = useRouter();

  const persist = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  useEffect(() => {
    persist();
  }, [persist]);

  // Restore wizard state from sessionStorage on client mount so refreshing
  // mid-flow resumes at the correct step. Deferred to useEffect to keep the
  // initial server/client render identical (both start at LOADING).
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as WizardState;
      if (parsed.token === token && parsed.step !== "CONFIRMATION" && parsed.step !== "ERROR") {
        dispatch({ type: "GO_TO", step: parsed.step });
      }
    } catch {}
  }, [token]);

  const {
    data: signupData,
    isLoading: isValidating,
    error: validationError,
  } = api.signupLink.validateToken.useQuery({ token }, { retry: false });

  useEffect(() => {
    if (signupData) {
      dispatch({
        type: "SET_CAMP_DATA",
        data: {
          campId: signupData.campId,
          campName: signupData.campName,
          campusId: signupData.campusId,
          campusName: signupData.campusName,
          organizationId: signupData.organizationId,
          organizationName: signupData.organizationName,
          year: signupData.year,
          theme: signupData.theme ?? undefined,
          bannerUrl: signupData.bannerUrl ?? undefined,
          logoUrl: signupData.logoUrl ?? undefined,
          minAge: signupData.minAge ?? undefined,
          maxAge: signupData.maxAge ?? undefined,
          ageCutoffDate: signupData.ageCutoffDate ?? undefined,
          status: signupData.status,
          registrationOpensAt: signupData.registrationOpensAt ?? undefined,
          registrationClosesAt: signupData.registrationClosesAt ?? undefined,
        },
      });
    }
  }, [signupData]);

  useEffect(() => {
    if (validationError && state.step === "LOADING") {
      dispatch({
        type: "SET_ERROR",
        title: "Invalid Invitation",
        message: validationError.message ?? "This invitation link is invalid or has expired.",
      });
    }
  }, [validationError, state.step]);

  const currentStepIndex = VISIBLE_STEPS.indexOf(state.step);
  const showProgress = currentStepIndex >= 0;

  if (state.step === "LOADING") {
    return <LoadingSkeleton />;
  }

  if (state.step === "ERROR" && state.error) {
    return <ErrorScreen title={state.error.title} message={state.error.message} />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6 sm:pt-10">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
          aria-label="Cancel registration"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showProgress && (
        <WizardProgress
          steps={VISIBLE_STEPS}
          currentStep={state.step}
          currentStepIndex={currentStepIndex}
        />
      )}

      {state.step === "LANDING" && state.campData && (
        <StepLanding
          campData={state.campData}
          onBegin={() => dispatch({ type: "GO_TO", step: "IDENTITY" })}
        />
      )}

      {(state.step === "IDENTITY" || state.step === "NEW_ACCOUNT" || state.step === "RETURNING_USER") && (
        <StepIdentity state={state} dispatch={dispatch} />
      )}

      {state.step === "TEENS" && (
        <StepTeens state={state} dispatch={dispatch} />
      )}

      {state.step === "DETAILS" && (
        <StepDetails state={state} dispatch={dispatch} />
      )}

      {state.step === "DOCUMENTS" && (
        <StepDocuments state={state} dispatch={dispatch} />
      )}

      {state.step === "REVIEW" && (
        <StepReview state={state} dispatch={dispatch} />
      )}

      {state.step === "CONFIRMATION" && (
        <StepConfirmation campName={state.campData?.campName ?? "Camp"} teens={state.teens} />
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="animate-pulse space-y-6">
        <div className="mx-auto h-2 w-48 rounded bg-neutral-200" />
        <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mx-auto h-6 w-48 rounded bg-neutral-200" />
          <div className="mx-auto h-4 w-36 rounded bg-neutral-200" />
          <div className="space-y-2 pt-4">
            <div className="h-4 w-full rounded bg-neutral-100" />
            <div className="h-4 w-2/3 rounded bg-neutral-100" />
          </div>
          <div className="h-12 rounded-xl bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
          <svg className="h-8 w-8 text-danger-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-neutral-900">{title}</h2>
        <p className="mb-6 text-neutral-600">{message}</p>
        <a
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-accent-600 px-6 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          Go to Login
        </a>
      </div>
    </div>
  );
}
