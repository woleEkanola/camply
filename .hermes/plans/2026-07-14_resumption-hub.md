# Resumption Hub Step — Post Signup/Login Dashboard

**Goal:** Insert a new "Hub" step between Identity (signup/login) and Teens that shows 3 cards: Register Teen, Resume Registration, View Status. No DB migrations.

---

## Files to modify

### 1. `src/app/register/[token]/types.ts`
- Add `"HUB"` to `WizardStep` type (after `"RETURNING_USER"`, before `"TEENS"`)
- Add `HUB: "Register"` to `STEP_LABELS`
- Update `VISIBLE_STEPS`: `["IDENTITY", "HUB", "TEENS", "DETAILS", "REVIEW"]`

### 2. `src/app/register/[token]/RegistrationWizard.tsx`
- Back map: add `HUB: "IDENTITY"`, change `TEENS: "HUB"`, change `DETAILS: "HUB"`
- Render `<StepHub>` when `state.step === "HUB"`
- Import StepHub

### 3. `src/app/register/[token]/steps/Identity.tsx`
- Change both `onSuccess` calls from `GO_TO: "TEENS"` → `GO_TO: "HUB"`
- NewAccountForm and ReturningUserForm both use `onSuccess: GO_TO("TEENS")` — change to `"HUB"`

### 4. **New:** `src/app/register/[token]/steps/Hub.tsx`
- Fetch `api.registration.getByUserId` to get existing registrations
- Filter registrations for this camp (matching `state.campData.campId`)
- Show 3 cards:
  1. **Register a Teen** — big primary card, starts new teen registration → `GO_TO: "TEENS"`
  2. **Resume Registration** — shown only if there are incomplete (DRAFT/REQUIRES_ACTION) registrations for this camp. Clicking resumes that registration (sets activeTeen + navigates to the right step based on completion)
  3. **View Status** — link to `/dashboard`
- Each card has icon, title, description, and action button
- Dashboard link footer at bottom

---

## Navigation flow

```
LANDING → IDENTITY → HUB → TEENS → DETAILS → DOCUMENTS → REVIEW → CONFIRMATION
                       ↑                           ↓
                       └── Resume (skips to right step)
                       
Back: HUB → IDENTITY, TEENS → HUB, DETAILS → HUB
```

---

## Verification
- `rm -rf .next && npm run build`
- `npx playwright test tests/parent-registration-flow.spec.ts --headed` — update test to click "Register a Teen" card instead of expecting Teens step directly after login
