# Unify Parent Form Configuration And Document Requirements

> **No database migrations.** No schema changes. Clean up UI and data mapping only.

**Goal:** Make `/admin/profile-fields` the single admin page for parent-facing form fields, declarations, AND required documents. Fix system vs custom field mapping in the dashboard "Add Camper" flow.

---

## Task 1: Add "Required Documents" tab to `/admin/profile-fields`

**File:** `src/app/admin/profile-fields/page.tsx`

- Add a new tab "Required Documents" alongside existing "Parents", "Volunteers", "Teachers" tabs
- Fetch `api.documentRequirement.listForOrg` (or create it if needed — currently `documentRequirement.list` takes `campId`)
- If no active camp, show: "Set an active camp first in Camp Settings."
- Each row shows: name, description, required toggle, scope, acceptedFormats, maxSizeMb
- Add/Edit/Delete document requirements inline (reuse existing mutations)
- Reuse existing `documentRequirement` router — no new API needed

**Need to check:** Does `documentRequirement.list` exist? If it requires `campId`, we need to get the active camp first.

---

## Task 2: Remove duplicate document editor from camp config

**File:** `src/app/admin/camps/[id]/config/page.tsx`

- Remove the "Required Documents" tab
- Add a link: "Manage required documents → /admin/profile-fields"
- Keep camp readiness checking — it reads `DocumentRequirement` internally, no UI needed

---

## Task 3: Fix dashboard "Add Camper" field mapping

**File:** `src/app/dashboard/profiles/new/page.tsx`

Currently it sends ALL field values as `fieldValues` regardless of source. Fix:
- SYSTEM fields (systemKey exists) → map into `profile` payload by `systemKey`
- CUSTOM fields (source === "CUSTOM") → map into `fieldValues` by `fieldId`
- Never pass system keys as `fieldId` values

Create a shared helper (or reuse the pattern from `Details.tsx` which already does this correctly):

```typescript
function splitFieldValues(visibleFields, values) {
  const profile = {};
  const fieldValues = [];
  for (const f of visibleFields) {
    const key = f.source === "SYSTEM" ? f.systemKey : f.id;
    const val = values[key];
    if (val !== undefined && val !== null && String(val) !== "") {
      if (f.source === "SYSTEM" && f.systemKey) {
        profile[f.systemKey] = val;
      } else if (f.source === "CUSTOM") {
        fieldValues.push({ fieldId: f.id, value: String(val) });
      }
    }
  }
  return { profile, fieldValues };
}
```

---

## Task 4: Server-side guardrails on camper.create/update

**File:** `src/server/api/routers/camper.ts`

In `camper.create` and `camper.update`:
- Validate that `fieldValues` IDs are valid CUSTOM form fields belonging to the same organization
- Reject or skip invalid IDs with a warning log
- Use the shared helper for splitting values

---

## Task 5: Remove hardcoded birth certificate gating from dashboard

**Files:** `src/app/dashboard/page.tsx`, `src/app/dashboard/profiles/[id]/page.tsx`

- `isCamperComplete()` in dashboard: remove `birthCert` check — only check required visible `FormField` values
- Profile page: remove birth certificate from completion checklist
- Document requirements are handled in the registration wizard (Documents step), not at profile creation time

---

## Task 6: Tests

- Update `dynamic-form-fields.spec.ts`: verify dashboard "Add Camper" maps system fields correctly
- Add test: profile completion no longer requires `birthCert`
- Run `npx playwright test tests/parent-registration-flow.spec.ts tests/dynamic-form-fields.spec.ts --headed`

---

## Verification

- `rm -rf .next && npm run build`
- `npm run test` (vitest)
- Playwright tests
