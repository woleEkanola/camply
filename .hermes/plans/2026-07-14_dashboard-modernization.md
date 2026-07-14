# Parent Dashboard UI/UX Modernization Plan

> **No database migrations. No schema changes. No API changes.**

**Goal:** Modernize the parent dashboard and camper profile experience — clear next actions, modern cards, consistent app chrome, readable profiles, guided registration state.

---

## Files in scope

| File | Changes |
|------|---------|
| `src/app/dashboard/page.tsx` | Wrap in AppShell, redesign with cards, unified status badges, clear actions |
| `src/app/dashboard/profiles/[id]/page.tsx` | Remove Tab.Group, single status panel, clean summary, remove debug text |
| `src/app/dashboard/profiles/new/page.tsx` | Already uses AppShell — minor polish if needed |
| `src/app/dashboard/register/[registrationId]/page.tsx` | Already built — verify consistency |

---

## Task 1: Unify dashboard under AppShell

**File:** `src/app/dashboard/page.tsx`

- Import `AppShell` from `@/components/layout/AppShell`
- Import `PageHeader`, `Card/CardBody`, `Button`, `StatusBadge`, `EmptyState`
- Wrap the page in `<AppShell area="dashboard">`
- Replace raw color classes (`blue-50`, `green-50`, etc.) with design tokens

---

## Task 2: Redesign dashboard landing

**File:** `src/app/dashboard/page.tsx`

- Page header: "Family Dashboard" with user email context
- Primary action: "Add Camper" button (prominent, top-right)
- Camper cards: name, campus, current registration status badge, next action
- Registration cards: camp name, campus, status badge, progress bar
- Empty states:
  - No campers: "You haven't added any campers yet. Create a camper profile to get started."
  - No registrations: "No camp registrations yet. Registration starts from a camper's profile."
- Keep existing queries unchanged

---

## Task 3: Redesign camper profile page

**File:** `src/app/dashboard/profiles/[id]/page.tsx`

- Remove single-tab `Tab.Group` — shows only one tab, adds noise
- Single status/action panel at top:
  - Camper name + status badge
  - Active camp registration status
  - Primary action: "Register for Camp" / "Continue Registration" / "View Registration"
- Replace disabled inputs with clean profile summary:
  - Name, DOB, gender, campus — displayed as label:value pairs
  - Only editable fields have inputs
- Documents card:
  - Birth certificate upload status + link
  - Upload/change action only when editing
- Remove debug text like "Missing for 100%"
- Replace with user-friendly checklist:
  - "To complete registration: Birth Certificate, Emergency Contact, ..."
  - Shown only when registration is blocked by missing items

---

## Task 4: Improve registration CTA logic

**File:** `src/app/dashboard/profiles/[id]/page.tsx`

- If registered for active camp → single summary card (status, camp, link)
- If not registered + profile incomplete → disabled button + missing-items checklist
- If not registered + profile complete → prominent "Register for [Camp Name]" button
- No duplicate status displays

---

## Task 5: Mobile polish

All dashboard pages:
- Cards stack cleanly on mobile (`flex-col sm:flex-row` etc.)
- Long names/emails/values wrap safely (`break-words`, `overflow-wrap:anywhere`)
- Full-width primary actions on mobile, right-aligned on desktop
- Touch targets ≥ `h-10`

---

## Task 6: Tests

- `npx playwright test tests/parent-registration-flow.spec.ts --headed`
- Add assertions:
  - Dashboard renders inside AppShell
  - No debug "Missing for 100%" text on profile page
  - Incomplete profile shows human-readable checklist
  - Registered camper shows one clear status card
  - Mobile no horizontal overflow

---

## Verification

- `rm -rf .next && npm run build`
- `npm run test` (vitest)
- `npx playwright test tests/parent-registration-flow.spec.ts --headed`
