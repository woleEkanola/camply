# Registration Review Workflow Redesign — Implementation Plan

> **For Hermes:** Use this plan to implement task-by-task. Every phase builds on the previous.

**Goal:** Redesign the registration review experience to support configurable two-step approval workflows, reversible decisions, decoupled email sending, bulk review actions, and change tracking — all without rewriting the existing engine, state machine, or side effect system.

**Architecture:** Extend the existing `Registration` model with a new `RegistrationReview` entity that tracks workflow state independently from registration lifecycle. Relax the state machine to allow APPROVED/REJECTED/WAITLISTED reversals. Decouple email sending from status transitions by having engine functions return metadata so callers decide. Redesign the admin detail drawer with a unified status dialog, communication card, decision history timeline, and review progress tracker. Add bulk actions to the registrations table.

**Key decisions settled:**
- Per-organization workflow config (single-step vs two-step)
- Verifiers = Campus Reps + any user assigned by admin
- State machine relaxed: APPROVED↔REJECTED↔WAITLISTED allowed; only CHECKED_IN/COMPLETED/ARCHIVED are final
- Engine returns `{previousStatus, newStatus, suggestedEmail, communicationType}`; existing callers auto-send; new UI has checkbox
- Full MVP: all features included

**Tech Stack:** Prisma, Next.js 16 App Router, tRPC, HeadlessUI Drawer, Tailwind CSS

---

## Phase 0: Database Changes

### Task 0.1: Add `approvalWorkflow` to Organization

**Objective:** Per-organization toggle between single-step and two-step approval.

**Files:**
- Modify: `prisma/schema.prisma` — add field to Organization

**Code:**
```prisma
model Organization {
  // ... existing fields ...
  approvalWorkflow String @default("SINGLE_STEP") // SINGLE_STEP | TWO_STEP
}
```

**Step 1:** Add field to schema
**Step 2:** Generate migration SQL: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > migration.sql`
**Step 3:** Run `npx prisma db execute --file migration.sql --schema prisma/schema.prisma`
**Step 4:** `npx prisma generate`

### Task 0.2: Create `RegistrationReview` model

**Objective:** Track verification workflow independently from registration status.

**Files:**
- Modify: `prisma/schema.prisma` — add model

**Code:**
```prisma
model RegistrationReview {
  id                 String       @id @default(cuid())
  registrationId     String       @unique
  registration       Registration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  
  // Verification (two-step only)
  assignedToId       String?      // userId of verifier
  verificationStatus String       @default("NOT_STARTED") // NOT_STARTED | IN_PROGRESS | COMPLETED
  verifiedById       String?      // userId who completed verification
  recommendation     String?      // APPROVE | REJECT | CORRECTION
  reviewNotes        String?      // verifier's private notes
  
  // Admin decision (populated on final status change)
  adminDecision      String?      // APPROVE | REJECT | WAITLIST | CORRECTION | CANCEL | ARCHIVE
  decidedById        String?
  decidedAt          DateTime?
  
  // Timestamps
  assignedAt         DateTime?
  verifiedAt         DateTime?
  completedAt        DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
}
```

**Step 1:** Add model
**Step 2:** Generate + deploy migration
**Step 3:** `npx prisma generate`

### Task 0.3: Add `Registration.communicationLog`

**Objective:** Track email sending status per registration (decoupled from status transitions).

**Files:**
- Modify: `prisma/schema.prisma` — add field

**Code:**
```prisma
model Registration {
  // ... existing fields ...
  communicationLog Json? // {"ACCEPTANCE": "SENT"|"NOT_SENT", "REJECTION": "SENT"|"NOT_SENT", "CORRECTION": "SENT"|"NOT_SENT", "WAITLIST": "SENT"|"NOT_SENT"}
}
```

**Step 1:** Add field
**Step 2:** Generate + deploy migration
**Step 3:** `npx prisma generate`

### Task 0.4: Add `Registration.fieldChangeLog`

**Objective:** Track field changes for "Changes Since Last Review" feature.

**Files:**
- Modify: `prisma/schema.prisma` — add field

**Code:**
```prisma
model Registration {
  // ... existing fields ...
  fieldChangeLog Json? // [{field: string, previousValue: string, newValue: string, changedAt: DateTime, changedById: string}]
}
```

**Step 1:** Add field
**Step 2:** Generate + deploy migration
**Step 3:** `npx prisma generate`

---

## Phase 1: Engine Changes

### Task 1.1: Relax the state machine

**Objective:** Allow APPROVED/REJECTED/WAITLISTED to transition freely between each other.

**Files:**
- Modify: `src/server/registration/stateMachine.ts`

**Current (strict):**
```typescript
PENDING: ["APPROVED", "REJECTED", "WAITLISTED", "REQUIRES_ACTION", "CANCELLED"],
APPROVED: ["CANCELLED", "CHECKED_IN", "ARCHIVED"],
REJECTED: ["PENDING", "ARCHIVED"],
WAITLISTED: ["APPROVED", "REJECTED", "CANCELLED"],
```

**New (relaxed):**
```typescript
PENDING: ["APPROVED", "REJECTED", "WAITLISTED", "REQUIRES_ACTION", "CANCELLED"],
APPROVED: ["REJECTED", "WAITLISTED", "CANCELLED", "CHECKED_IN", "ARCHIVED"],
REJECTED: ["APPROVED", "WAITLISTED", "PENDING", "ARCHIVED"],
WAITLISTED: ["APPROVED", "REJECTED", "CANCELLED"],
```

**Invariant:** CHECKED_IN, COMPLETED, ARCHIVED remain protected (no reversal allowed from these).

**Step 1:** Update `TRANSITIONS` map
**Step 2:** Run existing vitest: `npm run test` — the engine tests should still pass (verify no tests assert the old strictness)

### Task 1.2: Decouple email from engine — return metadata

**Objective:** Engine functions return `{previousStatus, newStatus, suggestedEmail, communicationType}` instead of auto-sending email.

**Files:**
- Modify: `src/server/registration/engine.ts`

**New return type:**
```typescript
export interface TransitionResult {
  registration: Registration;
  previousStatus: RegistrationStatus;
  newStatus: RegistrationStatus;
  suggestedEmail: boolean;
  communicationType: "REGISTRATION_APPROVED" | "REGISTRATION_REJECTED" | "CORRECTION_REQUESTED" | "REGISTRATION_WAITLISTED" | "REGISTRATION_SUBMITTED" | null;
}
```

**Changes per function:**
- `approveRegistration()` — remove `runSideEffectsNow()` call; return `TransitionResult` with `suggestedEmail: true, communicationType: "REGISTRATION_APPROVED"`
- `rejectRegistration()` — same; `communicationType: "REGISTRATION_REJECTED"`
- `requestCorrection()` — same; `communicationType: "CORRECTION_REQUESTED"`
- `waitlistRegistration()` — same; `communicationType: "REGISTRATION_WAITLISTED"`
- `submitRegistration()` — same; `communicationType: "REGISTRATION_SUBMITTED"`
- `resubmitRegistration()` — same
- All other functions (cancel, archive, checkIn, checkOut, transferVenue) — `suggestedEmail: false`

**Backward compat helper:**
```typescript
export async function transitionAndNotify(params: {
  transitionFn: () => Promise<TransitionResult>;
  sendEmail: boolean;
}): Promise<TransitionResult> {
  const result = await params.transitionFn();
  if (params.sendEmail && result.suggestedEmail && result.communicationType) {
    await runSideEffectsNow(result.registration.id, result.communicationType);
  }
  return result;
}
```

**Step 1:** Define `TransitionResult` interface
**Step 2:** Update each engine function to return metadata instead of calling `runSideEffectsNow()`
**Step 3:** Create `transitionAndNotify()` helper
**Step 4:** Update all existing tRPC callers to use `transitionAndNotify(result, true)` for backward compatibility
**Step 5:** Run vitest: all engine tests should pass

### Task 1.3: Update tRPC router callers

**Objective:** All existing mutations use `transitionAndNotify()` with `sendEmail: true` to preserve current behavior.

**Files:**
- Modify: `src/server/api/routers/registration.ts`

**Pattern change for each mutation:**
```typescript
// Before:
return await engine.approveRegistration({ registrationId, actorId });

// After:
const result = await engine.transitionAndNotify({
  transitionFn: () => engine.approveRegistration({ registrationId, actorId }),
  sendEmail: true, // backward compat — new UI will pass a variable
});
return result.registration;
```

**Add new mutation:** `transitionWithOptions`
```typescript
transitionWithOptions: protectedProcedure
  .input(z.object({
    registrationId: z.string(),
    action: z.enum(["APPROVE", "REJECT", "WAITLIST", "REQUEST_CORRECTION", "CANCEL", "ARCHIVE"]),
    reason: z.string().optional(),
    message: z.string().optional(),
    sendEmail: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    // auth check + call appropriate engine function + transitionAndNotify with input.sendEmail
  }),
```

**Step 1:** Add `transitionWithOptions` mutation
**Step 2:** Update all existing mutations to use `transitionAndNotify()` wrapper
**Step 3:** `npx tsc --noEmit` (expect pre-existing errors only)

### Task 1.4: Track field changes on update

**Objective:** When registration fields are updated (via `updateFields`), log the change for "Changes Since Last Review".

**Files:**
- Modify: `src/server/api/routers/registration.ts` — `updateFields` mutation

**Logic:**
Before updating, compare incoming data with current values. For each changed field, append to `fieldChangeLog` JSON array.

```typescript
const previousData = { /* current field values */ };
const changes: any[] = [];
for (const [key, value] of Object.entries(input.data)) {
  if (previousData[key] !== value) {
    changes.push({ field: key, previousValue: previousData[key], newValue: value, changedAt: new Date(), changedById: ctx.userId });
  }
}
// Update registration with: { ...input.data, fieldChangeLog: [...(registration.fieldChangeLog || []), ...changes] }
```

**Step 1:** Add change tracking to `updateFields`
**Step 2:** Test: update a field, verify `fieldChangeLog` has the entry

---

## Phase 2: tRPC — Review Workflow

### Task 2.1: Add review procedures to registration router

**Objective:** CRUD for `RegistrationReview` + assignment + verification.

**Files:**
- Modify: `src/server/api/routers/registration.ts` — add procedures

**New procedures:**
```typescript
// Get review state for a registration
getReview: protectedProcedure
  .input(z.object({ registrationId: z.string() }))
  .query(async ({ ctx, input }) => {
    return ctx.prisma.registrationReview.findUnique({ where: { registrationId: input.registrationId } });
  }),

// Assign verifier (admin only)
assignVerifier: protectedProcedure
  .input(z.object({ registrationId: z.string(), assigneeId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // auth: assertOrgAdmin
    // create or update RegistrationReview row
    return ctx.prisma.registrationReview.upsert({
      where: { registrationId: input.registrationId },
      update: { assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
      create: { registrationId: input.registrationId, assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
    });
  }),

// Unassign verifier
unassignVerifier: protectedProcedure
  .input(z.object({ registrationId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return ctx.prisma.registrationReview.update({
      where: { registrationId: input.registrationId },
      data: { assignedToId: null, verificationStatus: "NOT_STARTED" },
    });
  }),

// Complete verification (verifier only)
completeVerification: protectedProcedure
  .input(z.object({
    registrationId: z.string(),
    recommendation: z.enum(["APPROVE", "REJECT", "CORRECTION"]),
    reviewNotes: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // auth: must be the assigned verifier or a campus rep
    return ctx.prisma.registrationReview.update({
      where: { registrationId: input.registrationId },
      data: {
        verificationStatus: "COMPLETED",
        verifiedById: ctx.userId,
        verifiedAt: new Date(),
        recommendation: input.recommendation,
        reviewNotes: input.reviewNotes,
      },
    });
  }),

// Bulk assign (admin only)
bulkAssignVerifier: protectedProcedure
  .input(z.object({ registrationIds: z.array(z.string()), assigneeId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // auth: assertOrgAdmin
    for (const id of input.registrationIds) {
      await ctx.prisma.registrationReview.upsert({
        where: { registrationId: id },
        update: { assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
        create: { registrationId: id, assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
      });
    }
    return { count: input.registrationIds.length };
  }),
```

**Step 1:** Add all review procedures
**Step 2:** `npx tsc --noEmit`

### Task 2.2: Add organization workflow config to org router

**Objective:** Read/write `approvalWorkflow` on Organization.

**Files:**
- Modify: `src/server/api/routers/organization.ts` — add field to get/update

**Step 1:** Add `approvalWorkflow` to the org query return type
**Step 2:** Add `updateApprovalWorkflow` mutation
**Step 3:** `npx tsc --noEmit`

---

## Phase 3: Admin Registration Detail Drawer — Redesign

### Task 3.1: Replace scattered action buttons with unified Status Dialog

**Objective:** Single "Change Status" button that opens a contextual dialog.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — `RegistrationDetail` component
- Create: `src/app/admin/registrations/components/StatusDialog.tsx`

**StatusDialog component:**
```tsx
interface StatusDialogProps {
  open: boolean;
  onClose: () => void;
  registration: any;
  currentStatus: string;
  onSubmit: (action: string, options: { reason?: string; message?: string; sendEmail: boolean }) => void;
}
```

**Dialog content — dynamic fields per action:**

| Action | Fields |
|---|---|
| Approve | Venue dropdown (if multiple), Registration Number preview, Tribe suggestion, ☑ Send acceptance email |
| Reject | Reason textarea (required), ☑ Send rejection email |
| Waitlist | ☑ Send waitlist notification |
| Request Correction | Message textarea (required), ☑ Notify parent |
| Cancel | Reason (optional) |
| Archive | Confirmation only |

**Step 1:** Create `StatusDialog.tsx`
**Step 2:** Wire into `RegistrationDetail`
**Step 3:** Remove old individual action buttons

### Task 3.2: Add Communication Card

**Objective:** Show email delivery status per communication type, with Send/Resend buttons.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — add card in `RegistrationDetail`

**Card layout:**
```
Communication
├── Acceptance Email: [Sent] Yesterday 2:31 PM — [Resend]
├── Rejection Email:  [Not Sent] — [Send]
├── Correction:       [Not Sent] — [Send]
└── Waitlist:         [Not Sent] — [Send]
```

Data from `registration.communicationLog` JSON field.

**Step 1:** Add Communication card component within `RegistrationDetail`
**Step 2:** Wire Send/Resend to `transitionWithOptions` or `resendAcceptanceEmail`

### Task 3.3: Add Decision History Timeline

**Objective:** Visual timeline of all status decisions extracted from audit log.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — replace existing timeline tab

**Design:** Vertical stepper with:
```
PENDING ────── Jul 14, 9:00 AM
    ↓
REJECTED ───── Jul 14, 9:15 AM
    Missing consent form
    ↓
APPROVED ───── Jul 14, 10:30 AM
    Consent received. Admin override.
```

Filter audit log for status-change actions only (`REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, etc.).

**Step 1:** Implement `DecisionHistory` component
**Step 2:** Add as a new tab or replace timeline tab content

### Task 3.4: Add Review Progress Card (two-step only)

**Objective:** Visual stepper showing where the registration is in the review workflow.

**Files:**
- Create: `src/app/admin/registrations/components/ReviewProgress.tsx`

**Design:**
```
Review Progress
┌─────────────────────────────────────────┐
│ ● Submission                    ✓ Done  │
│ ● Verification         ✓ Sarah Johnson │
│ ○ Final Approval            Waiting    │
└─────────────────────────────────────────┘
```

Only visible when `organization.approvalWorkflow === "TWO_STEP"`.

**States:**
- Submission: always ✓
- Verification: NOT_STARTED → IN_PROGRESS (with assignee name) → ✓ COMPLETED (with recommendation badge)
- Final Approval: LOCKED (until verification done) → WAITING → ✓ (with decision)

**Step 1:** Create `ReviewProgress` component
**Step 2:** Conditionally render in `RegistrationDetail`

### Task 3.5: Add Verifier Assignment section

**Objective:** Assign/unassign verifier, show assignment history.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — add section in `RegistrationDetail`

**Design:**
```
Verification
├── Assigned To: Sarah Johnson [Change]
├── Assigned: Today 9:20 AM
├── Status: In Progress
└── History:
    ├── Assigned to Sarah Johnson — Jul 14, 9:20 AM
    └── Assigned to John Doe — Jul 13, 2:00 PM
```

Assignment history from audit log (filter `REVIEWER_ASSIGNED` events, or from separate tracking).

**Step 1:** Add verifier assignment section
**Step 2:** Wire assign/unassign to tRPC mutations

### Task 3.6: Add Changes Since Last Review

**Objective:** When reopening a registration, show what fields changed.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — add section in `RegistrationDetail`

**Design:** Collapsible section showing:
```
Changes Since Last Review (3 changes)
├── Medical form: uploaded ✓
├── Emergency contact: "Jane Doe" → "John Doe"
└── Allergy added: "Peanuts"
```

Data from `registration.fieldChangeLog`.

**Step 1:** Add `ChangesSinceReview` component
**Step 2:** Filter changes after `registration.reviewedAt` or last verification date

---

## Phase 4: Bulk Review Actions

### Task 4.1: Add bulk action toolbar to registration table

**Objective:** Select multiple registrations and perform bulk actions.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx`
- Create: `src/app/admin/registrations/components/BulkActions.tsx`

**Design:**
- Checkbox column in table (select all / select individual)
- Floating toolbar appears when ≥1 selected:
  ```
  12 selected  |  [Assign Verifier ▼] [Approve] [Reject] [Waitlist] [Send Email] [Export]
  ```
- Confirmation dialog for each action showing count and preview

**Step 1:** Add checkbox column to `Table`
**Step 2:** Create `BulkActions` toolbar
**Step 3:** Wire to bulk tRPC mutations

### Task 4.2: Add bulk tRPC procedures

**Objective:** Backend support for bulk operations.

**Files:**
- Modify: `src/server/api/routers/registration.ts`

**New procedures:**
```typescript
bulkTransition: protectedProcedure
  .input(z.object({
    registrationIds: z.array(z.string()),
    action: z.enum(["APPROVE", "REJECT", "WAITLIST", "CANCEL", "ARCHIVE"]),
    reason: z.string().optional(),
    sendEmail: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    const results: { id: string; success: boolean; error?: string }[] = [];
    for (const id of input.registrationIds) {
      try {
        // auth check per registration
        // call engine + transitionAndNotify
        results.push({ id, success: true });
      } catch (e) {
        results.push({ id, success: false, error: e.message });
      }
    }
    return { results, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
  }),

bulkSendEmail: protectedProcedure
  .input(z.object({
    registrationIds: z.array(z.string()),
    type: z.enum(["ACCEPTANCE", "REJECTION", "CORRECTION", "WAITLIST"]),
  }))
  .mutation(async ({ ctx, input }) => { /* similar loop */ }),
```

**Step 1:** Add bulk procedures
**Step 2:** `npx tsc --noEmit`

---

## Phase 5: Dashboard KPI Update

### Task 5.1: Replace status KPIs with workflow-aware metrics

**Objective:** Show "Waiting Verification", "Waiting Admin", "Corrections Required" instead of just status counts.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — KPI bar

**New KPIs:**
```typescript
// When two-step enabled:
"Waiting Verification" — PENDING + verificationStatus NOT_STARTED/IN_PROGRESS
"Waiting Admin" — PENDING + verificationStatus COMPLETED
"Corrections Required" — REQUIRES_ACTION count
"Approved" — APPROVED count

// When single-step (existing behavior):
"Pending" — PENDING count
"Approved" — APPROVED count
"Rejected" — REJECTED count
"Waitlisted" — WAITLISTED count
"Corrections Required" — REQUIRES_ACTION count
"Checked In" — CHECKED_IN count
```

**Step 1:** Add a `useQuery` for review stats (or derive from existing data)
**Step 2:** Conditionally render two-step vs single-step KPI cards

---

## Phase 6: Table Enhancements

### Task 6.1: Add workflow sub-badge to status column

**Objective:** Show "Waiting Verification" or "Waiting Admin" below the PENDING badge.

**Files:**
- Modify: `src/app/admin/registrations/page.tsx` — table column renderer

**Design:**
```
Status column:
┌──────────────────┐
│ PENDING          │
│ Waiting Admin    │  ← smaller, muted text
└──────────────────┘
```

**Logic:** If `organization.approvalWorkflow === "TWO_STEP"` and status is PENDING, query `RegistrationReview` to determine sub-status.

**Step 1:** Enhance status column renderer
**Step 2:** Batch-load review states for visible registrations

---

## Phase 7: Verification

### Task 7.1: Run full verification loop

```bash
# 1. Kill node, clean build
taskkill //F //IM node.exe
rm -rf .next && npm run build

# 2. Type check
npx tsc --noEmit  # expect pre-existing errors only

# 3. Vitest
npm run test  # all 69 must pass + new engine tests

# 4. Playwright
npx playwright test --headed

# 5. Server boot + curl health check
PORT=3001 npx next start &
curl http://localhost:3001/login
```

### Task 7.2: Create new Playwright spec

**Files:**
- Create: `tests/registration-review-workflow.spec.ts`

**Test flows:**
1. Login as admin, navigate to registrations
2. Verify KPI bar shows workflow-aware metrics
3. Click a registration row → drawer opens
4. Verify "Change Status" button exists, old individual buttons gone
5. Open status dialog, select "Approve" → verify venue/tribe/email checkbox visible
6. Uncheck email, approve → verify communication card shows "Not Sent"
7. Send acceptance email from communication card → verify status updates
8. Enable two-step workflow → verify Review Progress card appears
9. Assign verifier, complete verification → verify admin sees recommendation
10. Bulk select 2+ registrations → assign verifier → verify success
11. Change approved registration to rejected → verify decision history shows reversal

---

## Files Summary

### New Files (8)
| Path | Purpose |
|---|---|
| `src/app/admin/registrations/components/StatusDialog.tsx` | Unified status change dialog |
| `src/app/admin/registrations/components/ReviewProgress.tsx` | Visual review stepper |
| `src/app/admin/registrations/components/CommunicationCard.tsx` | Email delivery status + send/resend |
| `src/app/admin/registrations/components/DecisionHistory.tsx` | Visual decision timeline |
| `src/app/admin/registrations/components/ChangesSinceReview.tsx` | Field change diff |
| `src/app/admin/registrations/components/BulkActions.tsx` | Bulk selection toolbar |
| `tests/registration-review-workflow.spec.ts` | Playwright E2E tests |

### Modified Files (6)
| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add `approvalWorkflow` to Org, add `RegistrationReview` model, add `communicationLog` + `fieldChangeLog` to Registration |
| `src/server/registration/stateMachine.ts` | Relax transitions (APPROVED↔REJECTED↔WAITLISTED) |
| `src/server/registration/engine.ts` | Return `TransitionResult` metadata, decouple email, add `transitionAndNotify()` |
| `src/server/api/routers/registration.ts` | Add review procedures, bulk procedures, `transitionWithOptions`, update callers, track field changes |
| `src/server/api/routers/organization.ts` | Add `approvalWorkflow` field |
| `src/app/admin/registrations/page.tsx` | Redesign drawer, add all new components, update KPI bar, add bulk toolbar |

---

## Risk Mitigation

1. **Backward compatibility:** All existing engine callers use `transitionAndNotify(result, true)` — zero behavior change for single-step orgs
2. **State machine migration:** Existing APPROVED registrations won't break — only new transitions are allowed, old ones still valid
3. **Verifier permissions:** Verifier mutations check `assignedToId === ctx.userId` OR `role === CAMPUS_REPRESENTATIVE` — no accidental privilege escalation
4. **Field change tracking:** Only added to `updateFields` mutation (the one parents use to edit forms) — not every status change
5. **Bulk safety:** Each registration in a bulk operation is independently auth-checked and error-isolated — one failure doesn't roll back the batch
