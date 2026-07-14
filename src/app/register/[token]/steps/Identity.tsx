"use client";

import { useState } from "react";
import type { WizardState, WizardAction } from "../types";
import { EmailGate } from "../components/EmailGate";
import { NewAccountForm } from "../components/NewAccountForm";
import { ReturningUserForm } from "../components/ReturningUserForm";

interface StepIdentityProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function StepIdentity({ state, dispatch }: StepIdentityProps) {
  if (state.step === "IDENTITY") {
    return (
      <EmailGate
        email={state.email}
        onEmailChange={(email) => dispatch({ type: "SET_EMAIL", email })}
        onContinue={(isNew) => {
          dispatch({ type: "SET_IS_NEW_USER", isNewUser: isNew });
          dispatch({ type: "GO_TO", step: isNew ? "NEW_ACCOUNT" : "RETURNING_USER" });
        }}
        onBack={() => dispatch({ type: "GO_BACK" })}
        campName={state.campData?.campName ?? "Camp"}
      />
    );
  }

  if (state.step === "NEW_ACCOUNT") {
    return (
      <NewAccountForm
        email={state.email}
        firstName={state.firstName}
        lastName={state.lastName}
        authMethod={state.authMethod}
        onFirstNameChange={(v) => dispatch({ type: "SET_NAMES", firstName: v, lastName: state.lastName })}
        onLastNameChange={(v) => dispatch({ type: "SET_NAMES", firstName: state.firstName, lastName: v })}
        onAuthMethodChange={(m) => dispatch({ type: "SET_AUTH_METHOD", method: m })}
        onBack={() => dispatch({ type: "GO_BACK" })}
        onSuccess={() => dispatch({ type: "GO_TO", step: "HUB" })}
        token={state.token}
        organizationId={state.campData?.organizationId ?? ""}
        campusId={state.campData?.campusId ?? ""}
        campId={state.campData?.campId ?? ""}
      />
    );
  }

  if (state.step === "RETURNING_USER") {
    return (
      <ReturningUserForm
        email={state.email}
        onBack={() => dispatch({ type: "GO_BACK" })}
        onSuccess={() => dispatch({ type: "GO_TO", step: "HUB" })}
      />
    );
  }

  return null;
}
