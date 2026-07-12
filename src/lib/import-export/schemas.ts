import { z } from "zod";

/** Accepts true/false/yes/no/1/0 (any case), a real boolean, or blank/undefined. */
const boolish = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "1"].includes(s)) return true;
  if (["false", "no", "0"].includes(s)) return false;
  return v; // let it fail validation below with a clear message
}, z.boolean().optional());

const optionalText = z
  .preprocess((v) => (v === "" || v === undefined || v === null ? undefined : v), z.string().optional());

const coercedInt = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? v : n;
}, z.number().int().optional());

/** Accepts a pipe-separated string ("a|b|c") or an already-parsed string array. */
const responsibilitiesField = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) return v;
  return String(v)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}, z.array(z.string()).optional());

export const campusRowSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  city: z.string().min(2, "City must be at least 2 characters"),
  country: z.string().min(2, "Country must be at least 2 characters"),
  state: optionalText,
  zipCode: optionalText,
  pastor: optionalText,
  phone: optionalText,
  email: optionalText,
  campusCode: optionalText,
  active: boolish,
  signupOpen: boolish,
  displayOrder: coercedInt,
});

export const tribeRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().max(10, "Code must be at most 10 characters").optional()
  ),
  color: optionalText,
  description: optionalText,
  meaning: optionalText,
  motto: optionalText,
  scripture: optionalText,
  gender: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.enum(["MALE", "FEMALE", "MIXED"]).optional()
  ),
  ageRange: optionalText,
  maxCapacity: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isNaN(n) ? v : n;
  }, z.number().int().min(1, "maxCapacity must be at least 1").optional()),
  allocationStrategy: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.enum(["MANUAL", "AUTOMATIC", "INVITE_ONLY"]).optional()
  ),
  displayOrder: coercedInt,
  logoUrl: optionalText,
  bannerUrl: optionalText,
});

export const departmentRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: optionalText,
  maxCapacity: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isNaN(n) ? v : n;
  }, z.number().int().positive("maxCapacity must be a positive integer").optional()),
  responsibilities: responsibilitiesField,
  status: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.enum(["ACTIVE", "INACTIVE"]).optional()
  ),
  campScoped: boolish,
});

export const importBundleSchema = z.object({
  campuses: z.array(campusRowSchema).max(500, "Maximum 500 campus rows per import").optional(),
  tribes: z.array(tribeRowSchema).max(500, "Maximum 500 tribe rows per import").optional(),
  departments: z.array(departmentRowSchema).max(500, "Maximum 500 department rows per import").optional(),
});

export type CampusRowInput = z.infer<typeof campusRowSchema>;
export type TribeRowInput = z.infer<typeof tribeRowSchema>;
export type DepartmentRowInput = z.infer<typeof departmentRowSchema>;
