// The canonical menu of built-in (non-custom) fields the Form Editor can
// show/hide/reorder/require per audience. `formField.list` lazily upserts
// any entry here that's missing for an org so behavior matches today's
// hardcoded wizards until an admin actively changes something — this list
// can grow later without a migration.

export type SystemFieldAudience = "CAMPER" | "TEACHER" | "VOLUNTEER";

export interface SystemFieldDefinition {
  systemKey: string;
  name: string;
  label: string;
  type:
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
  required: boolean;
  visible: boolean;
  sortOrder: number;
  groupLabel: string;
  options?: string[];
}

const TEACHER_SKILLS = ["Teaching", "Counseling", "Music", "Administration", "Technical", "Medical", "Sports", "Media"];
const VOLUNTEER_CATEGORIES = ["Registration", "Medical", "Kitchen", "Transport", "Security", "Media", "Logistics", "Technical", "Cleaning", "Protocol"];
const GENDER_OPTIONS = ["Male", "Female"];

function field(def: Omit<SystemFieldDefinition, "name">): SystemFieldDefinition {
  return { ...def, name: def.systemKey };
}

const CAMPER: SystemFieldDefinition[] = [
  field({ systemKey: "name", label: "Full Name", type: "TEXT", required: true, visible: true, sortOrder: 10, groupLabel: "Camper Information" }),
  field({ systemKey: "dateOfBirth", label: "Date of Birth", type: "DATE", required: true, visible: true, sortOrder: 20, groupLabel: "Camper Information" }),
  field({ systemKey: "gender", label: "Gender", type: "SELECT", required: true, visible: true, sortOrder: 30, groupLabel: "Camper Information", options: GENDER_OPTIONS }),
  // The primary self-signup wizard derives homeCampusId implicitly from which
  // SignupLink (per-Campus+Camp) the parent used, not a picker — but the
  // "add another camper" dashboard flow lets a parent choose explicitly.
  // Ship hidden by default so it doesn't wrongly appear as a required field
  // in the primary signup flow, where it can't actually be submitted.
  field({ systemKey: "homeCampusId", label: "Campus", type: "SELECT", required: false, visible: false, sortOrder: 40, groupLabel: "Camper Information" }),
  // Exist on Camper but unused by any current UI — ship hidden so nothing regresses.
  field({ systemKey: "firstName", label: "First Name", type: "TEXT", required: false, visible: false, sortOrder: 50, groupLabel: "Camper Information" }),
  field({ systemKey: "middleName", label: "Middle Name", type: "TEXT", required: false, visible: false, sortOrder: 60, groupLabel: "Camper Information" }),
  field({ systemKey: "lastName", label: "Last Name", type: "TEXT", required: false, visible: false, sortOrder: 70, groupLabel: "Camper Information" }),
  field({ systemKey: "preferredName", label: "Preferred Name", type: "TEXT", required: false, visible: false, sortOrder: 80, groupLabel: "Camper Information" }),
  field({ systemKey: "photoUrl", label: "Photo", type: "FILE", required: false, visible: false, sortOrder: 90, groupLabel: "Camper Information" }),
  field({ systemKey: "allergies", label: "Allergies", type: "LONG_TEXT", required: false, visible: false, sortOrder: 100, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "medicalConditions", label: "Medical Conditions", type: "LONG_TEXT", required: false, visible: false, sortOrder: 110, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "medications", label: "Medications", type: "LONG_TEXT", required: false, visible: false, sortOrder: 120, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "dietaryRestrictions", label: "Dietary Restrictions", type: "LONG_TEXT", required: false, visible: false, sortOrder: 130, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "emergencyContactName", label: "Emergency Contact Name", type: "TEXT", required: false, visible: false, sortOrder: 140, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "emergencyContactPhone", label: "Emergency Contact Phone", type: "TEXT", required: false, visible: false, sortOrder: 150, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "relationship", label: "Relationship", type: "TEXT", required: false, visible: false, sortOrder: 160, groupLabel: "Medical & Emergency" }),
  field({ systemKey: "school", label: "School", type: "TEXT", required: false, visible: false, sortOrder: 170, groupLabel: "Education & Church" }),
  field({ systemKey: "currentClass", label: "Current Class", type: "TEXT", required: false, visible: false, sortOrder: 180, groupLabel: "Education & Church" }),
  field({ systemKey: "church", label: "Church", type: "TEXT", required: false, visible: false, sortOrder: 190, groupLabel: "Education & Church" }),
  field({ systemKey: "pastor", label: "Pastor", type: "TEXT", required: false, visible: false, sortOrder: 200, groupLabel: "Education & Church" }),
];

const STAFF_PERSONAL = (): SystemFieldDefinition[] => [
  field({ systemKey: "firstName", label: "First Name", type: "TEXT", required: true, visible: true, sortOrder: 10, groupLabel: "Personal Information" }),
  field({ systemKey: "lastName", label: "Last Name", type: "TEXT", required: true, visible: true, sortOrder: 20, groupLabel: "Personal Information" }),
  field({ systemKey: "preferredName", label: "Preferred Name", type: "TEXT", required: false, visible: true, sortOrder: 30, groupLabel: "Personal Information" }),
  field({ systemKey: "gender", label: "Gender", type: "SELECT", required: false, visible: true, sortOrder: 40, groupLabel: "Personal Information", options: GENDER_OPTIONS }),
  field({ systemKey: "phone", label: "Phone Number", type: "TEXT", required: true, visible: true, sortOrder: 50, groupLabel: "Personal Information" }),
];

const STAFF_CHURCH = (startOrder: number): SystemFieldDefinition[] => [
  field({ systemKey: "church", label: "Church", type: "TEXT", required: false, visible: true, sortOrder: startOrder, groupLabel: "Church Information" }),
  // Free-text self-reported department at the registrant's HOME church (e.g.
  // "Choir", "Ushering") — unrelated to the camp's own Department model
  // below. Deliberately plain text, not a live-populated picker: an earlier
  // change mistakenly sourced its options from the camp Department table,
  // which made it look like (and get used as) a department-assignment
  // picker even though it never actually links to a Department row.
  field({ systemKey: "churchDepartment", label: "Home Church Department", type: "TEXT", required: false, visible: true, sortOrder: startOrder + 10, groupLabel: "Church Information" }),
  field({ systemKey: "yearsServing", label: "Years Serving", type: "TEXT", required: false, visible: true, sortOrder: startOrder + 20, groupLabel: "Church Information" }),
  field({ systemKey: "workerStatus", label: "Worker Status", type: "TEXT", required: false, visible: true, sortOrder: startOrder + 30, groupLabel: "Church Information" }),
];

// The real camp-role picker: selecting an option here sets StaffProfile's
// actual `departmentId` FK directly (systemKey matches the Prisma column
// name exactly, same trick as preferredCampusId/preferredTribeId below), so
// it's what formField.ts's live population and the capacity cap
// (src/server/staff/departmentCapacity.ts) both operate on.
const STAFF_DEPARTMENT_PICKER = (sortOrder: number): SystemFieldDefinition =>
  field({ systemKey: "departmentId", label: "Camp Department", type: "SELECT", required: false, visible: true, sortOrder, groupLabel: "Camp Preferences" });

const STAFF_EMERGENCY = (startOrder: number): SystemFieldDefinition[] => [
  field({ systemKey: "emergencyContactName", label: "Emergency Contact Name", type: "TEXT", required: false, visible: true, sortOrder: startOrder, groupLabel: "Emergency Information" }),
  field({ systemKey: "emergencyContactPhone", label: "Emergency Contact Phone", type: "TEXT", required: false, visible: true, sortOrder: startOrder + 10, groupLabel: "Emergency Information" }),
  field({ systemKey: "emergencyContactRelationship", label: "Relationship", type: "TEXT", required: false, visible: true, sortOrder: startOrder + 20, groupLabel: "Emergency Information" }),
  field({ systemKey: "medicalConditions", label: "Medical Conditions", type: "LONG_TEXT", required: false, visible: true, sortOrder: startOrder + 30, groupLabel: "Emergency Information" }),
  field({ systemKey: "allergies", label: "Allergies", type: "LONG_TEXT", required: false, visible: true, sortOrder: startOrder + 40, groupLabel: "Emergency Information" }),
];

// Exist on StaffProfile but unused by any current wizard UI — ship hidden.
const STAFF_HIDDEN = (startOrder: number): SystemFieldDefinition[] => [
  field({ systemKey: "dateOfBirth", label: "Date of Birth", type: "DATE", required: false, visible: false, sortOrder: startOrder, groupLabel: "Personal Information" }),
  field({ systemKey: "photoUrl", label: "Photo", type: "FILE", required: false, visible: false, sortOrder: startOrder + 10, groupLabel: "Personal Information" }),
  field({ systemKey: "preferredCampusId", label: "Home Campus", type: "SELECT", required: false, visible: false, sortOrder: startOrder + 20, groupLabel: "Camp Preferences" }),
  field({ systemKey: "preferredTribeId", label: "Preferred Tribe", type: "SELECT", required: false, visible: false, sortOrder: startOrder + 30, groupLabel: "Camp Preferences" }),
];

const TEACHER: SystemFieldDefinition[] = [
  ...STAFF_PERSONAL(),
  ...STAFF_CHURCH(60),
  STAFF_DEPARTMENT_PICKER(95),
  field({ systemKey: "previousCampExperience", label: "Previous Camp Experience", type: "LONG_TEXT", required: false, visible: true, sortOrder: 100, groupLabel: "Camp Preferences" }),
  field({ systemKey: "areasOfStrength", label: "Areas of Strength", type: "TEXT", required: false, visible: true, sortOrder: 110, groupLabel: "Camp Preferences" }),
  field({ systemKey: "preferredAgeGroup", label: "Preferred Age Group", type: "TEXT", required: false, visible: true, sortOrder: 120, groupLabel: "Camp Preferences" }),
  field({ systemKey: "skills", label: "Skills", type: "MULTI_SELECT", required: false, visible: true, sortOrder: 130, groupLabel: "Skills & Availability", options: TEACHER_SKILLS }),
  field({ systemKey: "availability", label: "Availability", type: "LONG_TEXT", required: false, visible: true, sortOrder: 140, groupLabel: "Skills & Availability" }),
  ...STAFF_EMERGENCY(150),
  ...STAFF_HIDDEN(200),
];

const VOLUNTEER: SystemFieldDefinition[] = [
  ...STAFF_PERSONAL(),
  ...STAFF_CHURCH(60),
  STAFF_DEPARTMENT_PICKER(95),
  field({ systemKey: "volunteerCategory", label: "Volunteer Category", type: "SELECT", required: false, visible: true, sortOrder: 100, groupLabel: "Camp Preferences", options: VOLUNTEER_CATEGORIES }),
  // Reuses TEACHER_SKILLS since StaffProfile.skills is a shared column with no existing
  // volunteer-specific list — a small deliberate addition, not just a port of prior behavior.
  field({ systemKey: "skills", label: "Skills", type: "MULTI_SELECT", required: false, visible: true, sortOrder: 110, groupLabel: "Skills & Availability", options: TEACHER_SKILLS }),
  field({ systemKey: "availability", label: "Availability", type: "LONG_TEXT", required: false, visible: true, sortOrder: 120, groupLabel: "Skills & Availability" }),
  ...STAFF_EMERGENCY(130),
  ...STAFF_HIDDEN(200),
];

export const SYSTEM_FIELD_REGISTRY: Record<SystemFieldAudience, SystemFieldDefinition[]> = {
  CAMPER,
  TEACHER,
  VOLUNTEER,
};

/** Lazily creates any registry-defined SYSTEM field an org doesn't have yet for this audience — never touches existing rows, so admin edits are never clobbered. */
export async function ensureSystemFields(prisma: any, organizationId: string, audience: SystemFieldAudience) {
  const registry = SYSTEM_FIELD_REGISTRY[audience];
  const existing = await prisma.formField.findMany({
    where: { organizationId, audience, source: "SYSTEM" },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((f: { name: string }) => f.name));
  const missing = registry.filter((f) => !existingNames.has(f.name));
  if (missing.length === 0) return;

  await prisma.formField.createMany({
    data: missing.map((f) => ({
      organizationId,
      audience,
      source: "SYSTEM" as const,
      systemKey: f.systemKey,
      name: f.name,
      label: f.label,
      type: f.type,
      required: f.required,
      visible: f.visible,
      options: f.options ? JSON.stringify(f.options) : null,
      groupLabel: f.groupLabel,
      sortOrder: f.sortOrder,
    })),
    skipDuplicates: true,
  });
}
