# Admin-Controlled Parent Registration — Implementation Plan

> **For Hermes:** Use autonomous-engineering-protocol and test-driven-development skills to implement this plan task-by-task.

**Goal:** Make the parent registration experience fully admin-controlled — no hardcoded field sections, declarations, or document expectations in the parent-facing wizard or dashboard registration flow.

**Architecture:** Replace hardcoded section lists with dynamic grouping via `DynamicFieldGroup`, sync admin declarations into wizard state, broaden the `camperUpdateSchema` to accept all admin-configurable SYSTEM fields, and replace hardcoded expectation/declaration UI with API-driven rendering.

**Tech Stack:** Next.js 15 App Router, tRPC, Prisma, React, TypeScript, Vitest, Playwright E2E

---

## Task 1: Broaden `camperUpdateSchema` to accept all Camper columns

**Objective:** The `camper.update` mutation must accept all SYSTEM fields that admin can make visible/required, so the public wizard can persist them to real `Camper` columns.

**Files:**
- Modify: `camply/src/server/api/routers/camper.ts:35-46` (schema)
- Modify: `camply/src/server/api/routers/camper.ts:504-527` (update data mapping)

**Step 1:** Add all missing Camper columns to `camperUpdateSchema` (Zod schema). Add these optional fields:
```
  preferredName: z.string().optional(),
  photoUrl: z.string().optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  medications: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  relationship: z.string().optional(),
  parentPhone: z.string().optional(),
  teenPhone: z.string().optional(),
  homeAddressStreet: z.string().optional(),
  homeAddressCity: z.string().optional(),
  homeAddressState: z.string().optional(),
  homeAddressZip: z.string().optional(),
  school: z.string().optional(),
  currentClass: z.string().optional(),
  church: z.string().optional(),
  pastor: z.string().optional(),
```

**Step 2:** Add corresponding `... (input.profile.XXX && { XXX: ... })` entries in the `ctx.prisma.camper.update` data object. Use `!== undefined` check for optional string fields (same pattern as existing `firstName`/`lastName` checks at line 509-511).

**Step 3:** Run `npx tsc --noEmit` to verify no type errors.

---

## Task 2: Replace hardcoded SECTIONS in Details.tsx with DynamicFieldGroup

**Objective:** The public wizard Details step must render ALL visible CAMPER fields grouped by `groupLabel`, not a hardcoded list.

**Files:**
- Modify: `camply/src/app/register/[token]/steps/Details.tsx`

**Step 1:** Import `DynamicFieldGroup`:
```tsx
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
```

**Step 2:** Remove the `SECTIONS` constant (line 10).

**Step 3:** Remove section-based state: `sectionIndex`, tab navigation UI (lines 157-175), and section-based field filtering (`sectionFields` at line 64-66).

**Step 4:** Build `visibleFields` from the query response, sorted by `sortOrder`:
```tsx
const visibleFields = useMemo(
  () => (fields ?? []).filter(f => f.visible).sort((a, b) => a.sortOrder - b.sortOrder),
  [fields]
);
```

**Step 5:** Replace the field rendering block (lines 192-203) with `DynamicFieldGroup`, keeping the `values` state and `handleChange` function but adapting the key logic:
- For `DynamicFieldGroup`, the key convention is: `field.source === "SYSTEM" ? field.systemKey! : field.id`. The current `handleChange` already uses `field.systemKey ?? field.id` — but `DynamicFieldGroup` passes `key` as `onChange(key, val)`. We need to align: use the same key convention throughout.

**Step 6:** The current `handleChange` uses `field.systemKey ?? field.id` while `DynamicFieldGroup` uses `field.source === "SYSTEM" ? field.systemKey! : field.id`. These should be equivalent for all practical purposes since SYSTEM fields always have `systemKey` and CUSTOM fields always have `source === "CUSTOM"`. But to be safe, in `persistToBackend` and `flushAndNavigate`, change `f.systemKey ?? f.id` to `f.source === "SYSTEM" ? f.systemKey! : f.id`.

**Step 7:** Remove section navigation buttons (Previous/Next) and replace with a single "Continue to Documents" button. Remove `isLastSection` logic. The entire page becomes one scrollable form.

**Step 8:** Keep the auto-save indicator and debounce logic unchanged.

**Step 9:** Remove the tab-list `role="tablist"` JSX entirely.

---

## Task 3: Add pre-submit validation for required fields in public wizard

**Objective:** Before navigating to Documents step, validate that all required visible fields have values. Show inline errors.

**Files:**
- Modify: `camply/src/app/register/[token]/steps/Details.tsx`

**Step 1:** Add a `validationErrors` state: `Record<string, string>`.

**Step 2:** In the "Continue to Documents" button handler, validate all required visible fields:
```tsx
const hasMissing = visibleFields.some(f => {
  if (!f.required) return false;
  const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
  const val = values[key];
  return val === undefined || val === null || String(val).trim() === "" || (Array.isArray(val) && val.length === 0);
});
```
If missing, set `validationErrors` with per-field messages and don't navigate.

**Step 3:** Pass `errors={validationErrors}` to `DynamicFieldGroup`.

**Step 4:** Clear errors on any field change.

---

## Task 4: Fix system field value mapping in public wizard

**Objective:** When the public wizard saves field values, system fields backed by real `Camper` columns should update the `profile` object (not just `fieldValues`), so the DB columns are updated.

**Files:**
- Modify: `camply/src/app/register/[token]/steps/Details.tsx`

**Step 1:** In `persistToBackend` and `flushAndNavigate`, build a proper `profile` object from system field values:
```tsx
// Collect system field values for profile update
const profile: Record<string, unknown> = {};
const fieldValues: { fieldId: string; value: string }[] = [];

for (const f of visibleFields) {
  const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
  const val = newValues[key];
  if (val !== undefined && val !== "" && f.source === "SYSTEM") {
    profile[f.systemKey!] = val;
  }
  if (val !== undefined && val !== "") {
    fieldValues.push({ fieldId: f.id, value: String(val) });
  }
}
```

**Step 2:** Pass `profile` instead of `{}` to `updateCamper.mutateAsync`.

**Step 3:** Also handle `dateOfBirth` conversion: if it's a string date, pass as ISO string (the schema already accepts `z.string().optional()` for `dateOfBirth`).

---

## Task 5: Fix declaration handling in public wizard

**Objective:** Sync fetched declarations into wizard state, distinguish required vs optional, fix checkbox reliability.

**Files:**
- Modify: `camply/src/app/register/[token]/types.ts` (add `SET_DECLARATIONS` action)
- Modify: `camply/src/app/register/[token]/RegistrationWizard.tsx` (reducer)
- Modify: `camply/src/app/register/[token]/steps/Review.tsx` (required vs optional logic)

**Step 1:** In `types.ts`, add a new action:
```ts
| { type: "SET_DECLARATIONS"; declarations: { id: string; label: string; required: boolean }[] }
```

**Step 2:** In `RegistrationWizard.tsx` reducer, add the case:
```ts
case "SET_DECLARATIONS":
  return {
    ...state,
    declarations: action.declarations.map(d => ({
      id: d.id,
      checked: state.declarations.find(sd => sd.id === d.id)?.checked ?? false,
    })),
  };
```

**Step 3:** Fix `SET_DECLARATION` to handle new IDs:
```ts
case "SET_DECLARATION":
  return {
    ...state,
    declarations: state.declarations.some(d => d.id === action.id)
      ? state.declarations.map(d => d.id === action.id ? { ...d, checked: action.checked } : d)
      : [...state.declarations, { id: action.id, checked: action.checked }],
  };
```

**Step 4:** In `Review.tsx`, after fetching declarations, dispatch them into state:
```tsx
useEffect(() => {
  if (declarations) {
    dispatch({ type: "SET_DECLARATIONS", declarations });
  }
}, [declarations, dispatch]);
```

**Step 5:** In `Review.tsx`, change `allDeclared` to only check required declarations:
```tsx
const requiredDeclarations = declarations?.filter(d => d.required) ?? [];
const allDeclared = requiredDeclarations.length === 0 || requiredDeclarations.every(d =>
  state.declarations.find(sd => sd.id === d.id)?.checked
);
```

---

## Task 6: Replace hardcoded dashboard registration declaration checkbox

**Objective:** Dashboard registration review step must use admin-configured declarations, not a hardcoded checkbox.

**Files:**
- Modify: `camply/src/app/dashboard/register/[registrationId]/page.tsx`

**Step 1:** Add a tRPC query for declarations:
```tsx
const { data: declarations } = api.registrationConfig.listDeclarations.useQuery(
  { organizationId: registration?.camper?.organizationId ?? "" },
  { enabled: !!registration?.camper?.organizationId }
);
```

**Step 2:** Add declaration state:
```tsx
const [declarationChecks, setDeclarationChecks] = useState<Record<string, boolean>>({});
```

**Step 3:** Sync fetched declarations into local state (useEffect). Preserve existing checks.

**Step 4:** Replace the hardcoded checkbox (lines 573-584) with a dynamic declaration list, matching the Review.tsx pattern.

**Step 5:** Disable submit button only when required declarations are unchecked:
```tsx
const allRequiredDeclared = (declarations ?? []).filter(d => d.required).every(d => declarationChecks[d.id]);
```

---

## Task 7: Make public landing page expectations dynamic

**Objective:** Replace hardcoded expectation list with dynamic content from admin configuration.

**Files:**
- Modify: `camply/src/app/register/[token]/steps/Landing.tsx`

**Step 1:** The landing page doesn't currently have access to `api.formField.list` or `api.documentRequirement.listByCamp`. Add props to pass `campId` and `organizationId`.

**Step 2:** Fetch configured fields and document requirements in `RegistrationWizard.tsx` (where `campData` is already available) and pass down derived expectations to `StepLanding`.

**Approach (simpler):** Replace the hardcoded list with dynamic generic copy and add a list of section names + document requirement names that are populated from queries.

**Or even simpler (acceptable):** Replace the hardcoded list with generic copy only:
```
"You'll review the information requested by your camp, upload any required documents, and confirm any required declarations before submitting."
```
Remove the numbered list entirely.

**Preference:** Do the simple approach first — generic copy. The camp name/organization already provides enough context. If time permits, add dynamic section/document names.

**Step 3:** Remove lines 133-157 (the expectations section with numbered list).

**Step 4:** Replace with:
```tsx
<h3 className="mb-4 text-sm font-semibold text-neutral-700">
  Ready to get started?
</h3>
<p className="text-sm text-neutral-600 mb-4">
  You'll provide information about your teen, upload any documents requested by the camp, and review everything before submitting.
</p>
```

---

## Task 8: Fix Documents step to detect already-uploaded documents

**Objective:** Public wizard documents step must use `api.document.listForRegistration` to detect existing uploads so documents survive page refresh.

**Files:**
- Modify: `camply/src/app/register/[token]/steps/Documents.tsx`

**Step 1:** Add a query for existing documents:
```tsx
const { data: existingDocs, refetch: refetchDocs } = api.document.listForRegistration.useQuery(
  { registrationId: activeTeen?.registrationId ?? "" },
  { enabled: !!activeTeen?.registrationId }
);
```

**Step 2:** Compute `uploadedRequirementIds` from `existingDocs` instead of local `uploadedDocIds` state:
```tsx
const uploadedRequirementIds = new Set(
  (existingDocs ?? []).filter((d: any) => d.status !== "REJECTED").map((d: any) => d.requirementId)
);
```

**Step 3:** Replace `uploadedDocIds.has(req.id)` checks with `uploadedRequirementIds.has(req.id)`.

**Step 4:** Update `handleDocUploaded` to call `refetchDocs()` instead of adding to local Set.

**Step 5:** Show already-uploaded documents with a green checkmark or "Uploaded" label in `DocumentRow`, similar to the dashboard `DocumentUploader` component.

---

## Task 9: Fix `/dashboard/profiles/new` authorization and hardcoded form

**Objective:** Fix the role check bug and make the form dynamically admin-driven.

**Files:**
- Modify: `camply/src/app/dashboard/profiles/new/page.tsx`

**Step 1:** Fix line 57: Change `session.user.role !== "ADMIN"` to allow PARENT role. The current check is wrong — it redirects PARENT users away from creating profiles. Replace with:
```tsx
} else if (session.user.role !== "PARENT" && session.user.role !== "ADMIN" && session.user.role !== "OWNER") {
```

**Step 2 (optional improvement):** Replace the hardcoded form fields (firstName, middleName, lastName, dateOfBirth, gender) with a minimal initial profile creation using `DynamicFieldGroup` for the full set of visible required fields. However, since this is a minimal profile creation step (and the parent will later fill in details), keeping it hardcoded to the essential name/DOB/gender fields is reasonable — these are the minimum needed to create a Camper record. The full admin-driven form appears later in the registration wizard or profile editor. **Decision: keep minimal profile creation, just fix the auth bug.**

---

## Task 10: Align public wizard FieldRenderer with shared DynamicFieldRenderer

**Objective:** The public wizard should reuse shared rendering components for consistency, with public-wizard-specific styling as a thin wrapper if needed.

**Files:**
- Modify: `camply/src/app/register/[token]/components/FieldRenderer.tsx` (if keeping) OR
- Replace usage with `DynamicFieldRenderer` from `@/components/forms/DynamicFieldRenderer`

**Step 1:** Since Task 2 already replaces the field rendering in Details.tsx with `DynamicFieldGroup` → `DynamicFieldRenderer`, the public wizard's `FieldRenderer` is no longer needed in the main flow. Check if `FieldRenderer` is used elsewhere:
- Search for all imports of `FieldRenderer` from the register path.

**Step 2:** If only used in `Details.tsx`, remove the component file. If used elsewhere, ensure consistency.

---

## Task 11: Create/update Playwright tests

**Objective:** Add E2E test coverage for the dynamic admin-driven registration. Run existing tests to ensure no regressions.

**Files:**
- Modify: `camply/tests/parent-registration-flow.spec.ts`
- Modify: `camply/tests/registration-review-workflow.spec.ts`
- Modify: `camply/tests/form-editor-admin.spec.ts`
- Create: `camply/tests/dynamic-form-fields.spec.ts` (new)

**Tests to add:**

1. **Custom camper field with custom section appears in public wizard:**
   - Create a custom CAMPER field with `groupLabel: "Test Section"`.
   - Open the public registration wizard.
   - Assert the field exists in the Details step.
   - Clean up.

2. **System field under "Education & Church" appears when visible:**
   - Ensure `school` is visible.
   - Open public wizard.
   - Assert "School" field is visible.
   - Assert "Education & Church" section header appears.

3. **Required custom field blocks navigation:**
   - Create a required custom field.
   - In public wizard, leave it empty and try to continue.
   - Assert validation error shown.
   - Fill it in and continue successfully.

4. **Admin declarations appear on public review page:**
   - Create a declaration via admin.
   - In public wizard review step, assert it appears.
   - Check it and submit successfully.

5. **Required declarations block submit, optional don't:**
   - Create one required and one optional declaration.
   - Leave both unchecked and try to submit → blocked.
   - Check only the required one → submit succeeds.

6. **Dashboard registration shows admin declarations:**
   - Navigate to dashboard registration review step.
   - Assert admin-configured declarations appear (not hardcoded text).

7. **Public wizard documents detect already-uploaded:**
   - Upload a document, refresh page.
   - Assert document is shown as already uploaded (not requiring re-upload).

---

## Task 12: Run full verification loop

**Objective:** After all changes, run the complete build+test pipeline.

**Files:** All modified files.

**Step 1:** Kill any running node processes: `taskkill //F //IM node.exe 2>/dev/null`

**Step 2:** Clean build: `rm -rf .next && npm run build` (in `camply/` directory)

**Step 3:** Fix any build errors.

**Step 4:** Start server: `PORT=3001 npm run dev` or `npm run start`

**Step 5:** Run TypeScript check: `npx tsc --noEmit`

**Step 6:** Run vitest: `npm run test`

**Step 7:** Run Playwright: `npx playwright test --headed`

**Step 8:** Self-heal any test failures.

**Step 9:** Run Playwright again until all pass.

---

## Files Summary

| Task | Files |
|------|-------|
| 1. camperUpdateSchema | `src/server/api/routers/camper.ts` |
| 2. DynamicFieldGroup in wizard | `src/app/register/[token]/steps/Details.tsx` |
| 3. Pre-submit validation | `src/app/register/[token]/steps/Details.tsx` |
| 4. System field mapping | `src/app/register/[token]/steps/Details.tsx` |
| 5. Declaration handling | `types.ts`, `RegistrationWizard.tsx`, `Review.tsx` |
| 6. Dashboard declarations | `src/app/dashboard/register/[registrationId]/page.tsx` |
| 7. Landing page dynamic | `src/app/register/[token]/steps/Landing.tsx` |
| 8. Documents detection | `src/app/register/[token]/steps/Documents.tsx` |
| 9. Profiles/new auth fix | `src/app/dashboard/profiles/new/page.tsx` |
| 10. FieldRenderer alignment | `src/app/register/[token]/components/FieldRenderer.tsx` |
| 11. Playwright tests | `tests/*.spec.ts` |
| 12. Verification | All |

---

## Risks & Tradeoffs

| Risk | Mitigation |
|------|------------|
| `DynamicFieldGroup` styling differs from public wizard | Wrap in a thin component with wizard-specific CSS classes if needed |
| `camperUpdateSchema` changes may affect admin camper CRUD | Only added optional fields; no existing behavior changed |
| Declaration state sync race condition | `SET_DECLARATIONS` preserves existing checked state; `useEffect` runs after fetch |
| Build-breaking change on Windows | Kill node procs first, use `rm -rf .next` before build |
| Existing tests break | Run full suite after each task; self-heal immediately |

---

## Verification Checklist

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] `npm run test` (vitest) passes
- [ ] `npx playwright test --headed` passes
- [ ] Admin creates custom field → appears in public wizard
- [ ] Education & Church section visible in public wizard
- [ ] Required field blocks navigation
- [ ] Declarations appear on review page (public + dashboard)
- [ ] Required declarations block submit
- [ ] Optional declarations don't block submit
- [ ] Documents survive page refresh
- [ ] Dashboard registration shows admin declarations (not hardcoded)
- [ ] Landing page doesn't mention hardcoded fields/documents
