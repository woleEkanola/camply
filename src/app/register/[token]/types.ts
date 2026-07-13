export type WizardStep =
  | "LOADING"
  | "LANDING"
  | "IDENTITY"
  | "NEW_ACCOUNT"
  | "RETURNING_USER"
  | "TEENS"
  | "DETAILS"
  | "DOCUMENTS"
  | "REVIEW"
  | "CONFIRMATION"
  | "ERROR";

export interface CampData {
  campId: string;
  campName: string;
  campusId: string;
  campusName: string;
  organizationId: string;
  organizationName: string;
  year: number;
  theme?: string;
  bannerUrl?: string;
  logoUrl?: string;
  minAge?: number;
  maxAge?: number;
  ageCutoffDate?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
}

export interface TeenRegistration {
  camperId: string;
  registrationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  fieldsComplete: boolean;
  documentsComplete: boolean;
}

export interface TeenFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

export type AuthMethod = "password" | "otp";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

export interface WizardState {
  step: WizardStep;
  previousStep: WizardStep | null;
  direction: "forward" | "backward";
  token: string;
  campData: CampData | null;
  email: string;
  isNewUser: boolean | null;
  firstName: string;
  lastName: string;
  authMethod: AuthMethod;
  teens: TeenRegistration[];
  activeTeenId: string | null;
  declarations: { id: string; checked: boolean }[];
  error: { title: string; message: string } | null;
  returnTo?: WizardStep;
}

export type WizardAction =
  | { type: "SET_CAMP_DATA"; data: CampData }
  | { type: "SET_EMAIL"; email: string }
  | { type: "SET_IS_NEW_USER"; isNewUser: boolean }
  | { type: "SET_NAMES"; firstName: string; lastName: string }
  | { type: "SET_AUTH_METHOD"; method: AuthMethod }
  | { type: "GO_TO"; step: WizardStep }
  | { type: "GO_BACK" }
  | { type: "GO_TO_EDIT"; camperId: string }
  | { type: "ADD_TEEN"; teen: TeenRegistration }
  | { type: "REMOVE_TEEN"; camperId: string }
  | { type: "SET_ACTIVE_TEEN"; camperId: string | null }
  | { type: "SET_TEEN_COMPLETE"; camperId: string; fieldsComplete: boolean; documentsComplete: boolean }
  | { type: "SET_DECLARATION"; id: string; checked: boolean }
  | { type: "SET_ERROR"; title: string; message: string }
  | { type: "CLEAR_ERROR" };

export const STEP_LABELS: Record<WizardStep, string> = {
  LOADING: "",
  LANDING: "Welcome",
  IDENTITY: "Email",
  NEW_ACCOUNT: "Account",
  RETURNING_USER: "Sign In",
  TEENS: "Teens",
  DETAILS: "Details",
  DOCUMENTS: "Documents",
  REVIEW: "Review",
  CONFIRMATION: "Done",
  ERROR: "",
};

export const VISIBLE_STEPS: WizardStep[] = ["IDENTITY", "TEENS", "DETAILS", "REVIEW"];
