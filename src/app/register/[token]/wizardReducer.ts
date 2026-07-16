import type { WizardState, WizardAction } from "./types";

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_CAMP_DATA":
      return {
        ...state,
        campData: action.data,
        step: state.step === "LOADING" ? "LANDING" : state.step,
      };
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
        // Not IDENTITY: a signed-in parent on the Hub going "back" to
        // "What's your email address?" reads as being logged out, even
        // though the session is untouched. LANDING is the right rest state
        // for an authenticated user; a signed-out user never reaches HUB
        // in the first place (TEEN_SCOPED_STEPS bounces them to IDENTITY).
        HUB: "LANDING",
        TEENS: "HUB",
        DETAILS: "HUB",
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
        declarations: state.declarations.some((d) => d.id === action.id)
          ? state.declarations.map((d) =>
              d.id === action.id ? { ...d, checked: action.checked } : d
            )
          : [...state.declarations, { id: action.id, checked: action.checked }],
      };
    case "SET_DECLARATIONS":
      return {
        ...state,
        declarations: action.declarations.map((d) => ({
          id: d.id,
          checked: state.declarations.find((sd) => sd.id === d.id)?.checked ?? false,
        })),
      };
    case "SET_ERROR":
      return { ...state, step: "ERROR", error: { title: action.title, message: action.message } };
    case "CLEAR_ERROR":
      return { ...state, step: state.previousStep ?? "LANDING", error: null };
    case "RESTORE":
      return { ...state, ...action.state, token: state.token };
    default:
      return state;
  }
}

export function createInitialState(token: string): WizardState {
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

// Fields restored verbatim from sessionStorage on a mid-wizard reload. Deliberately
// excludes `direction`/`error`/`returnTo`/`isLoading`-adjacent transient fields.
export const RESTORE_KEYS = [
  "step",
  "previousStep",
  "campData",
  "email",
  "isNewUser",
  "firstName",
  "lastName",
  "authMethod",
  "teens",
  "activeTeenId",
  "declarations",
  "returnTo",
] as const;
