# Parent Wizard Upload, Mobile UX, Crop, And Email Sender Fix

> **For Hermes:** Use autonomous-engineering-protocol and test-driven-development skills.

**Goal:** Fix mobile document upload (camera vs file picker), add headshot photo crop, polish mobile UI, and fix email sender slug consistency. **No database migrations.**

**Tech Stack:** Next.js 15 App Router, tRPC, React, TypeScript, Canvas API (no new deps), Playwright E2E

---

## Files discovered (pre-plan reconnaissance)

### Camera/file picker
- `src/app/register/[token]/steps/Documents.tsx:141` — `capture="environment"` on hidden input forces camera on mobile
- `src/app/register/[token]/components/PhotoUploader.tsx:75` — same issue for photo fields
- `src/components/file-upload.tsx` — generic FileUpload (no capture attribute, but no camera option either)

### Email sender
- `src/server/email/fromAddress.ts` — `buildFromAddress()` helper exists, uses `orgSlug@camply.ng` or fallback
- `src/server/email/sendWelcomeEmail.ts:13` — uses `orgSlug ? slug@camply.ng : donotreply` (bypasses helper)
- `src/server/email/sendOtpEmail.ts:10` — same pattern
- `src/server/email/sendTestEmail.ts:7` — same pattern
- `src/server/email/sendStaffEmails.ts:8,26` — same pattern
- `src/server/email/sendAcceptanceEmail.ts:25,46,58,70,82` — same pattern
- `src/server/api/routers/communication.ts:430` — **hardcoded** `"donotreply@camply.ng"` (broadcast router)
- Additional: password reset, staff OTP, registration-submitted fallback

### Photo upload
- `src/components/file-upload.tsx` — generic FileUpload component with preview
- `src/app/register/[token]/components/PhotoUploader.tsx` — wizard-specific photo uploader
- `src/app/register/[token]/steps/Review.tsx` — shows headshot in review with `aspect-square` container
- `src/components/forms/DynamicFieldRenderer.tsx:220-231` — renders FileUpload for FILE type fields

---

## Task Plan

### Task 1: Fix document upload — two explicit buttons (Choose File / Take Photo)

**Files:**
- Modify: `src/app/register/[token]/steps/Documents.tsx`

**Changes in `DocumentRow`:**
- Remove single hidden `<input type="file" capture="environment">`
- Replace with two visible buttons:
  - **"Choose File"** — triggers `<input type="file" accept={...}>` (NO capture attribute)
  - **"Take Photo"** — triggers `<input type="file" accept="image/*" capture="environment">`
- Both inputs remain hidden, triggered via refs
- Both use the same `handleFile` function for validation + upload
- Keep existing validation, compression, UploadThing flow, `onUploaded` callback unchanged
- Display accepted formats and max size info below the buttons
- On mobile: stack buttons vertically with larger touch targets

---

### Task 2: Headshot photo upload with crop + empty photo slot

**Files:**
- Modify: `src/app/register/[token]/components/PhotoUploader.tsx`
- Modify: `src/components/forms/DynamicFieldRenderer.tsx` (FILE type rendering)

**Changes in PhotoUploader:**
- Add empty photo slot (`aspect-square` container with dashed border + camera icon, like Review page avatar)
- Show current photo in slot with `object-cover` when uploaded
- Two buttons: "Choose File" (no capture) + "Take Photo" (capture="environment")
- "Crop" button — opens canvas-based crop UI overlay:
  - Fixed square crop area centered on image
  - Drag to reposition, zoom via range slider
  - "Apply Crop" → canvas `drawImage` + `toBlob` → upload cropped result
  - No new library dependency — native Canvas API
- "Remove" button clears the photo
- Upload through existing compression + UploadThing flow

**Changes in DynamicFieldRenderer (FILE type):**
- For wizard context (systemKey === "photoUrl"), render the specialized PhotoUploader instead of generic FileUpload
- Keep generic FileUpload for admin/config/non-photo FILE fields

---

### Task 3: Mobile UI polish across wizard

**Files:**
- Modify: `src/app/register/[token]/components/WizardProgress.tsx`
- Modify: `src/app/register/[token]/components/TeenCard.tsx`  
- Modify: `src/app/register/[token]/components/TeenSwitcher.tsx`
- Modify: `src/app/register/[token]/steps/Review.tsx`
- Modify: `src/app/register/[token]/steps/Documents.tsx`

**Changes:**
- WizardProgress: Add step label text (e.g. "Step 2 of 5 · Details") not just numbers
- TeenCard: `flex-wrap` on small screens, prevent overflow on long names
- TeenSwitcher: horizontal scroll or wrap for many teens
- Review: `grid-cols-1` on mobile (already sm:grid-cols-2 for field grid), wrap document rows
- Documents: larger touch targets for Choose File / Take Photo buttons
- All: `break-words` / `truncate` on field labels, values, email displays
- Ensure no horizontal overflow at 320px viewport

---

### Task 4: Fix email sender slug consistency

**Files:**
- Modify: `src/server/email/sendWelcomeEmail.ts`
- Modify: `src/server/email/sendOtpEmail.ts`
- Modify: `src/server/email/sendTestEmail.ts`
- Modify: `src/server/email/sendStaffEmails.ts`
- Modify: `src/server/email/sendAcceptanceEmail.ts`
- Modify: `src/server/api/routers/communication.ts` (broadcast)
- Check: password reset, staff OTP, registration-submitted paths

**Changes:**
- Replace all `orgSlug ? \`${orgSlug}@camply.ng\` : 'donotreply@camply.ng'` patterns with `buildFromAddress({ orgSlug })`
- In `communication.ts` broadcast router: accept optional `orgSlug` param, use `buildFromAddress`
- In password reset flow: resolve org slug from user/organization and pass to `buildFromAddress`
- In staff OTP flow: pass org slug from staff profile
- In registration-submitted flow: pass org slug from registration → camper → organization
- Keep `buildFromAddress` as the single source of truth for sender address formatting
- Fallback to `donotreply@camply.ng` only when no slug available (already built into helper)

---

### Task 5: Tests

**Files:**
- Modify: `tests/parent-registration-flow.spec.ts` — add camera/file picker assertions
- Modify/create: tests for email sender helper and mobile layout

**Tests:**
- Document upload shows "Choose File" and "Take Photo" as separate buttons
- File picker input has NO `capture` attribute
- Camera input HAS `capture="environment"`
- Photo field shows empty square slot before upload
- Photo field shows image in slot after upload
- `buildFromAddress({ orgSlug: "tcn" })` returns `tcn@camply.ng`
- `buildFromAddress({})` returns `donotreply@camply.ng`
- Mobile viewport (375px) has no horizontal scroll on landing/details/docs/review steps

---

### Task 6: Verification

- `rm -rf .next && npm run build`
- `npm run test` (vitest)
- `npx playwright test tests/parent-registration-flow.spec.ts --headed`
- Self-heal any failures

---

## Risk & Tradeoffs

| Risk | Mitigation |
|------|------------|
| Canvas crop could lose image quality | Use `compressImage` after crop (existing flow), set reasonable canvas resolution |
| PhotoUploader is used in both wizard and admin | Only change wizard-specific behavior; admin FileUpload stays generic |
| Email changes could break if org slug is null | `buildFromAddress` already handles null slug with fallback |
| Mobile changes could break desktop | Use responsive classes only, no layout restructure |
