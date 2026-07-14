# Wizard UX Polish + Camp Config Size/Format Fields

> **No database migrations. No new dependencies.**

**Goal:** Polish the parent wizard UX (navigation buttons, delete/edit labels, dashboard link) and add editable size/format fields to camp document requirements in admin.

---

## Task 1: Add maxSizeMb + acceptedFormats to Camp Config page

**File:** `src/app/admin/camps/[id]/config/page.tsx`

- In the "Required Documents" tab (tab2Content):
  - Existing rows show name, scope, required badge, and Make Required/Remove buttons
  - **Add**: display `acceptedFormats` and `maxSizeMb` below each requirement name
  - In the add form (lines 363-378), add two new inputs:
    - `acceptedFormats` — text input, default `"jpg,png"`
    - `maxSizeMb` — number input, default `2`
  - Pass these to `createRequirement.mutate`
- Also add inline edit capability: clicking a requirement row opens quick-edit for formats/size

---

## Task 2: Replace save & return + tiny back text with big Back/Next buttons

**File:** `src/app/register/[token]/steps/Details.tsx`

- Remove `state.returnTo === "REVIEW"` conditional — only show one flow
- Remove small "← Back" text link at top (lines 199-200)
- Replace bottom button area with:
  ```
  [← Back (border)]              [Continue to Documents → (accent)]
  ```
- Back always calls `dispatch({ type: "GO_BACK" })` which goes to TEENS
- Add small "Go to Dashboard" text link below buttons

---

## Task 3: Review page — Edit button + Back button

**File:** `src/app/register/[token]/steps/Review.tsx`

- Replace edit icon (svg pencil, lines 131-134) with `<Button size="sm" variant="secondary">Edit</Button>`
- Replace bottom single submit button with pair:
  ```
  [← Back (border)]              [Submit Registration (accent)]
  ```
- Back goes to DOCUMENTS step (not skipping)

---

## Task 4: Confirmation page — Go to Dashboard

**File:** `src/app/register/[token]/steps/Confirmation.tsx`

- Already has "View Registration Status" link to `/dashboard` — rename to "Go to Dashboard" for clarity

---

## Task 5: TeenCard — Delete button instead of × icon

**File:** `src/app/register/[token]/components/TeenCard.tsx`

- Replace the circular × button with:
  ```tsx
  <Button size="sm" variant="ghost" className="text-danger-600">Delete</Button>
  ```

---

## Task 6: Dashboard link on every wizard page

**Files:** `Landing.tsx`, `Identity.tsx`, `Teens.tsx`, `Details.tsx`, `Documents.tsx`, `Review.tsx`

Add a consistent footer to each step:
```tsx
<div className="mt-6 text-center">
  <a href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-600 underline">
    Go to Dashboard
  </a>
</div>
```

---

## Task 7: Navigation — ensure Back/Next never skip steps

The wizard reducer already handles this via `GO_BACK` and `GO_TO`. The back map in `RegistrationWizard.tsx` (lines 49-56) defines:
```ts
IDENTITY → LANDING
TEENS → IDENTITY (etc)
DETAILS → TEENS
DOCUMENTS → DETAILS
REVIEW → DOCUMENTS
```
This is correct — each Back goes exactly one step. The GO_TO_EDIT path goes from REVIEW → DETAILS for editing, which is intentional for fixing fields. No change needed — just verify it works.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/admin/camps/[id]/config/page.tsx` | maxSizeMb + acceptedFormats inputs |
| `src/app/register/[token]/steps/Details.tsx` | Remove save+return, remove tiny back, big Back+Next buttons |
| `src/app/register/[token]/steps/Review.tsx` | Edit button, Back button beside Submit |
| `src/app/register/[token]/steps/Confirmation.tsx` | Rename link to "Go to Dashboard" |
| `src/app/register/[token]/components/TeenCard.tsx` | "Delete" button instead of × |
| `src/app/register/[token]/steps/Landing.tsx` | Dashboard link footer |
| `src/app/register/[token]/steps/Teens.tsx` | Dashboard link footer |
| `src/app/register/[token]/steps/Details.tsx` | Dashboard link footer |
| `src/app/register/[token]/steps/Documents.tsx` | Dashboard link footer |
| `src/app/register/[token]/steps/Review.tsx` | Dashboard link footer |

## Verification

- `rm -rf .next && npm run build`
- `npm run test` (vitest)
- `npx playwright test tests/parent-registration-flow.spec.ts --headed`
