"use client";

import { useReducer, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/utils/trpc";
import type { WizardState } from "./types";
import { VISIBLE_STEPS } from "./types";
import { wizardReducer, createInitialState, RESTORE_KEYS } from "./wizardReducer";
import { WizardProgress } from "./components/WizardProgress";
import { StepLanding } from "./steps/Landing";
import { StepIdentity } from "./steps/Identity";
import { StepHub } from "./steps/Hub";
import { StepTeens } from "./steps/Teens";
import { StepDetails } from "./steps/Details";
import { StepDocuments } from "./steps/Documents";
import { StepReview } from "./steps/Review";
import { StepConfirmation } from "./steps/Confirmation";

const STORAGE_PREFIX = "camply-registration-wizard";
// A snapshot older than this is treated as stale and ignored on restore —
// localStorage (unlike sessionStorage) outlives the browser session, so an
// abandoned registration from days ago shouldn't silently resume.
const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

function storageKey(token: string) {
  return `${STORAGE_PREFIX}:${token}`;
}

function clearPersistedWizardState(token: string) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(storageKey(token));
  }
}

export function RegistrationWizard({ token }: { token: string }) {
  const [state, dispatch] = useReducer(wizardReducer, token, createInitialState);
  const router = useRouter();
  const hydratedRef = useRef(false);

  // Restore wizard state from localStorage on client mount so refreshing
  // mid-flow — or the mobile browser discarding a backgrounded tab, which
  // wipes sessionStorage but not localStorage — resumes at the correct step
  // WITH the in-progress teens intact, not just the step number. Must run —
  // and mark hydration complete — before the persist effect below, or the
  // initial LOADING/empty-teens render clobbers storage first.
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(token));
    if (stored) {
      try {
        const snapshot = JSON.parse(stored) as { savedAt: number; state: WizardState };
        const parsed = snapshot.state;
        const isFresh = Date.now() - snapshot.savedAt < MAX_SNAPSHOT_AGE_MS;
        if (
          isFresh &&
          parsed.token === token &&
          parsed.step !== "CONFIRMATION" &&
          parsed.step !== "ERROR" &&
          parsed.step !== "LOADING"
        ) {
          const restored: Partial<WizardState> = {};
          for (const key of RESTORE_KEYS) {
            (restored as any)[key] = parsed[key];
          }
          dispatch({ type: "RESTORE", state: restored });
        } else if (!isFresh) {
          clearPersistedWizardState(token);
        }
      } catch {}
    }
    hydratedRef.current = true;
  }, [token]);

  const persist = useCallback(() => {
    if (typeof window !== "undefined" && hydratedRef.current) {
      localStorage.setItem(storageKey(token), JSON.stringify({ savedAt: Date.now(), state }));
    }
  }, [state, token]);

  useEffect(() => {
    persist();
  }, [persist]);

  // Once a registration is submitted, the saved snapshot has nothing left to
  // resume — clear it so a later visit to this same signup link starts fresh
  // instead of restoring a completed wizard.
  useEffect(() => {
    if (state.step === "CONFIRMATION") {
      clearPersistedWizardState(token);
    }
  }, [state.step, token]);

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
          startDate: signupData.startDate ?? undefined,
          endDate: signupData.endDate ?? undefined,
          registrationOpensAt: signupData.registrationOpensAt ?? undefined,
          registrationClosesAt: signupData.registrationClosesAt ?? undefined,
        },
      });
    }
  }, [signupData]);

  // If ?step=hub is in the URL, route directly to hub after token validation
  const searchParams = useSearchParams();
  const shouldGoToHub = searchParams.get("step") === "hub";
  const { data: session, status: sessionStatus } = useSession();

  useEffect(() => {
    if (!shouldGoToHub || !signupData) return;
    if (session?.user?.email) {
      dispatch({ type: "SET_EMAIL", email: session.user.email });
      dispatch({ type: "GO_TO", step: "HUB" });
    } else {
      // Not logged in — route through identity which will then go to HUB
      dispatch({ type: "GO_TO", step: "IDENTITY" });
    }
  }, [shouldGoToHub, signupData, session]);

  useEffect(() => {
    if (validationError && state.step === "LOADING") {
      dispatch({
        type: "SET_ERROR",
        title: "Invalid Invitation",
        message: validationError.message ?? "This invitation link is invalid or has expired.",
      });
    }
  }, [validationError, state.step]);

  // Fallback for a restored teen-scoped step whose session cookie didn't
  // survive the reload (normally it does — the JWT cookie is independent of
  // sessionStorage). Email is already restored, so re-auth is one step.
  const TEEN_SCOPED_STEPS: WizardState["step"][] = ["HUB", "TEENS", "DETAILS", "DOCUMENTS", "REVIEW"];
  useEffect(() => {
    if (sessionStatus === "unauthenticated" && TEEN_SCOPED_STEPS.includes(state.step)) {
      dispatch({ type: "GO_TO", step: "IDENTITY" });
    }
  }, [sessionStatus, state.step]);

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
          onClick={() => {
            clearPersistedWizardState(token);
            router.push("/dashboard");
          }}
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

      {state.step === "HUB" && (
        <StepHub state={state} dispatch={dispatch} />
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
        <StepConfirmation campName={state.campData?.campName ?? "Camp"} teens={state.teens} token={token} />
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
