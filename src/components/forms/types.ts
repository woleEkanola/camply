export type FormFieldAudience = "CAMPER" | "TEACHER" | "VOLUNTEER";
export type FormFieldSource = "SYSTEM" | "CUSTOM";
export type FormFieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "DATE"
  | "BOOLEAN"
  | "CHECKBOX"
  | "SELECT"
  | "MULTI_SELECT"
  | "RADIO"
  | "FILE";

export interface FormFieldDTO {
  id: string;
  organizationId: string;
  audience: FormFieldAudience;
  source: FormFieldSource;
  systemKey: string | null;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  visible: boolean;
  options: string | null;
  helpText: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  groupLabel: string | null;
  sortOrder: number;
}
