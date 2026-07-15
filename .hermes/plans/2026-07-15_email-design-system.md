# Prompt: Redesign Camply's Email Visual Design System

> **For another LLM:** This is a self-contained implementation prompt. Execute it task-by-task using TDD.

## Context

Camply is a camp registration platform. It already has a working email backend: TipTap templates stored as JSON in PostgreSQL, variable interpolation, Resend delivery, QR code generation, org branding, an outbox/retry queue, and an admin UI with a TipTap rich text editor.

The architecture works. The visual design does not.

Your job is to redesign the **rendering layer** only — how emails look and feel — without touching the backend architecture, database schema, or API routes.

---

## What already exists (DO NOT REPLACE)

| Layer | Path | Notes |
|-------|------|-------|
| **Sender helper** | `src/server/email/fromAddress.ts` | `buildFromAddress({ orgSlug, senderName, fallback })` |
| **Template loader** | `src/server/email/templateLoader.ts` | `loadTemplateForEvent(orgId, eventKey)` → `{ subject, tiptapJson, branding, enabled }` |
| **TipTap renderer** | `src/server/email/renderer.ts` | `renderTemplateContent(tiptapJson, variables)` — TipTap JSON → HTML via `@tiptap/html`. `wrapWithBranding(contentHtml, branding)` — wraps in logo/colors/footer. `renderEmail({ tiptapJson, variables, branding })` — full pipeline. |
| **Custom TipTap node** | `src/server/email/buttonExtension.ts` | `EmailButton` node with `label` + `href` attributes |
| **Default templates** | `src/server/email/defaults.ts` | `DEFAULT_TEMPLATES` — 9 TipTap JSON documents |
| **Variable registry** | `src/server/email/variables.ts` | `EMAIL_VARIABLES` — 24 template variables with sample data |
| **Side effects** | `src/server/registration/effects.ts` | `tryTemplateEmail(eventKey, variables, hardcodedFn)` — loads template, renders, falls back to hardcoded |
| **Hardcoded fallbacks** | `src/server/email/sendAcceptanceEmail.ts`, `sendWelcomeEmail.ts`, `sendOtpEmail.ts`, `sendStaffEmails.ts` | Used when templates are disabled/missing |
| **Admin UI** | `src/app/admin/communication/*` | TipTap editor for templates, branding settings |
| **Branding model** | `OrganizationBranding` (Prisma) | logoUrl, primaryColor, accentColor, buttonColor, headerImageUrl, senderName, footerText, supportEmail, supportPhone, websiteUrl, facebookUrl, instagramUrl, address |
| **DB models** | `EmailTemplate`, `EmailEventConfig`, `Broadcast`, `RegistrationDeclaration` | Do not modify |

---

## What you will build

### Phase 1: Design Token System

Create `src/server/email/theme.ts`:

```typescript
export const theme = {
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", xxl: "48px" },
  radius: { sm: "6px", md: "10px", lg: "16px", xl: "24px" },
  font: { family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  fontSize: { heading: "22px", subheading: "16px", body: "14px", caption: "12px", label: "11px" },
  fontWeight: { bold: "700", semibold: "600", normal: "400" },
  color: {
    primary: "var(--brand-primary, #E67E22)",
    accent: "var(--brand-accent, #E67E22)",
    button: "var(--brand-button, #E67E22)",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    neutral: { 50: "#FAFAFA", 100: "#F5F5F5", 200: "#E5E5E5", 300: "#D4D4D4", 400: "#A3A3A3", 500: "#737373", 700: "#404040", 900: "#171717" },
    surface: "#FFFFFF",
    background: "#F8F9FA",
  },
  shadow: { card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" },
};
```

### Phase 2: Reusable Email Components

Create `src/server/email/components/` with these components. Each is a function returning an HTML string (no React, no JSX). They consume `theme` tokens. Every component accepts `branding: Branding | null`.

| Component | Parameters | Behavior |
|-----------|-----------|----------|
| `EmailLayout` | `{ content: string, branding: Branding \| null }` | Full HTML document shell. Sets `:root` CSS vars from branding. 480px max-width centered table. |
| `EmailHero` | `{ illustration: string }` | Centered illustration image (emoji or URL). 72px tall. |
| `StatusBanner` | `{ type: "success"\|"warning"\|"danger"\|"info"\|"neutral", title: string, subtitle?: string }` | Colored banner strip with icon. Maps type to colors. |
| `Headline` | `{ text: string }` | 22px bold heading. |
| `Subheading` | `{ text: string }` | 16px medium subheading. |
| `BodyText` | `{ text: string }` | 14px normal body paragraph. |
| `InfoCard` | `{ rows: { label: string, value: string }[] }` | Table with label:value pairs. Alternating row backgrounds. Rounded corners. |
| `InfoRow` | `{ label: string, value: string }` | Single label:value row for inline use. |
| `QRCodeCard` | `{ qrDataUrl: string, registrationNumber: string }` | White card with centered QR (220px), registration number below, "Verified by Camply" caption. Generous padding. No colored background behind QR. |
| `Timeline` | `{ stages: { label: string, status: "completed"\|"current"\|"upcoming" }[] }` | Horizontal or stacked progress indicators. Completed = filled circle + green. Current = filled circle + primary color. Upcoming = empty circle + grey. |
| `PrimaryButton` | `{ label: string, href: string }` | Branded button using `--brand-button` color. Full width on mobile. |
| `SecondaryButton` | `{ label: string, href: string }` | Outlined variant. |
| `AlertCard` | `{ type: "warning"\|"danger"\|"info", title: string, message: string }` | Colored left border, icon, title + message. |
| `SupportCard` | `{ supportEmail?: string, supportPhone?: string, websiteUrl?: string }` | "Need help?" heading with contact links. Pulls from branding. |
| `Footer` | `{ branding: Branding \| null }` | Organization name, address, social links. "Powered by Camply" line. Unsubscribe note for broadcasts. |
| `Divider` | `{}` | 1px horizontal line with spacing. |
| `Section` | `{ children: string, padding?: string }` | Padded container. |
| `NextSteps` | `{ steps: string[] }` | Numbered list of steps. |

**Implementation rule:** Every component is a pure function returning an HTML string. Use template literals. Inject values directly. No React, no JSX, no runtime dependencies beyond what `theme` provides. Example:

```typescript
export function InfoCard(params: { rows: { label: string; value: string }[] }): string {
  const t = theme;
  const rows = params.rows.map((r, i) => `
    <tr>
      <td style="padding:${t.spacing.sm} ${t.spacing.md}; color:${t.color.neutral[500]}; font-size:${t.fontSize.caption}; font-family:${t.font.family}; border-bottom:1px solid ${t.color.neutral[100]};">
        ${escapeHtml(r.label)}
      </td>
      <td style="padding:${t.spacing.sm} ${t.spacing.md}; color:${t.color.neutral[900]}; font-size:${t.fontSize.body}; font-weight:${t.fontWeight.semibold}; font-family:${t.font.family}; border-bottom:1px solid ${t.color.neutral[100]};">
        ${escapeHtml(r.value)}
      </td>
    </tr>`).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.surface}; border-radius:${t.radius.lg}; overflow:hidden; box-shadow:${t.shadow.card};">
      ${rows}
    </table>`;
}
```

### Phase 3: Per-Event Email Assemblers

Create `src/server/email/events/` with one assembler per event type. Each assembler is a function that takes `{ variables, branding, qrDataUrl? }` and returns a complete HTML string by composing components.

| File | Event | Layout |
|------|-------|--------|
| `registrationApproved.ts` | REGISTRATION_APPROVED | Hero(🎉) → StatusBanner(success, "Registration Approved") → InfoCard(camper, camp, campus, reporting, reg#, tribe) → QRCodeCard → PrimaryButton("View Registration") → NextSteps → SupportCard → Footer |
| `registrationSubmitted.ts` | REGISTRATION_SUBMITTED | Hero(📋) → StatusBanner(info, "Registration Received") → BodyText("pending review") → InfoCard(camper, camp, reg#) → PrimaryButton("View Registration") → SupportCard → Footer |
| `correctionRequested.ts` | CORRECTION_REQUESTED | Hero(📝) → StatusBanner(warning, "Action Required") → AlertCard(warning, "Correction Needed", message) → PrimaryButton("Continue Registration") → SupportCard → Footer |
| `registrationRejected.ts` | REGISTRATION_REJECTED | Hero(📄) → StatusBanner(danger, "Not Approved") → BodyText(reason) → SupportCard → Footer |
| `registrationWaitlisted.ts` | REGISTRATION_WAITLISTED | Hero(⏳) → StatusBanner(warning, "Waitlisted") → BodyText("space may open") → InfoCard(camper, camp) → SupportCard → Footer |
| `staffApproved.ts` | STAFF_APPROVED | Hero(🎉) → StatusBanner(success, "Approved") → InfoCard → PrimaryButton("Go to Dashboard") → SupportCard → Footer |
| `staffRejected.ts` | STAFF_REJECTED | Hero(📄) → StatusBanner(danger, "Not Approved") → BodyText → SupportCard → Footer |
| `welcomeEmail.ts` | WELCOME_EMAIL | Hero(👋) → Headline("Welcome to Camply!") → BodyText → PrimaryButton("Verify Email") → NextSteps(3 steps) → Footer |
| `otpEmail.ts` | OTP_EMAIL | Hero(🔐) → Headline("Your OTP Code") → InfoCard with large OTP → BodyText("expires in 10 minutes") → Footer |

### Phase 4: Replace the Renderer Pipeline

Modify `src/server/email/renderer.ts` — replace `wrapWithBranding()` and `renderEmail()`:

1. **Remove** the old `wrapWithBranding()` function entirely
2. **Rewrite** `renderEmail()` to:
   - Call `renderTemplateContent(tiptapJson, variables)` to get the content HTML (the TipTap body)
   - Build the email using the appropriate event assembler (pass `contentHtml` as `bodyContent`)
   - If no branding is configured, use a minimal fallback layout
3. **Add** `renderEmailWithEvent(params: { eventKey, variables, branding, qrDataUrl?, contentHtml? })` that routes to the correct assembler

The new `renderEmail()` signature stays the same for backward compatibility:
```typescript
export async function renderEmail(params: {
  tiptapJson: Record<string, unknown>;
  variables: Record<string, string>;
  branding: Branding | null;
}): Promise<string>
```

### Phase 5: Update Template Loader

Modify `src/server/email/templateLoader.ts`:
- Keep all existing logic
- Add `event` to `LoadedTemplate` return type
- No other changes needed — the event key is already available from the caller

### Phase 6: Update Side Effects

Modify `src/server/registration/effects.ts`:
- In `tryTemplateEmail()`, pass the event key to `renderEmail()`
- The assembler for the event type will handle layout automatically
- Keep the hardcoded fallback functions — they should continue working as-is

### Phase 7: QR Code Generation

The QR code is already generated server-side in effects.ts via `qrDataUrlForToken()`. Ensure:
- Generated at 300x300 minimum resolution
- Returned as `data:image/png;base64,...` 
- The `QRCodeCard` component receives this data URL and embeds it as an `<img>` with `src="data:image/png;base64,..."`
- No external image URLs for QR codes
- White background explicitly set on the image container

### Phase 8: Update Hardcoded Fallbacks

Modify `src/server/email/sendAcceptanceEmail.ts` and other hardcoded senders:
- Use the new component system instead of raw HTML strings
- The `sendAcceptanceEmail()` should use `StatusBanner`, `InfoCard`, `PrimaryButton`, `SupportCard`, `Footer`
- Import `theme` and components directly — no need for the template pipeline for fallbacks

---

## Implementation Order

1. Create `theme.ts`
2. Create all components in `components/`
3. Create `EmailLayout` and `Footer` first (needed by everything)
4. Create `QRCodeCard` with a unit test verifying 220px image, white background
5. Create one event assembler (`registrationApproved.ts`) as a reference
6. Create the remaining 8 event assemblers
7. Rewrite `renderEmail()` in renderer.ts
8. Update `templateLoader.ts` to pass event key
9. Update `effects.ts` to pass event key to renderer
10. Update hardcoded fallback senders
11. Build and run `npx playwright test tests/communication-center.spec.ts --headed`

---

## Verification

- `rm -rf .next && npm run build`
- `npm run test` (vitest)
- `npx playwright test tests/communication-center.spec.ts --headed`
- Manual test: send a test email from `/admin/communication/events`
- Verify QR code renders in acceptance email on Gmail, Apple Mail, and Outlook

---

## Rules

- **No database migrations**
- **No Prisma schema changes**
- **No API route changes**
- **No changes to `EmailTemplate.content` structure** (TipTap JSON stays)
- **Do not remove the TipTap editor** — admins still edit content there
- **The admin edits only the body section** — layout is enforced by components
- **Every component is a pure HTML string function** — no React, no JSX, no runtime dependencies
- **All colors come from `theme.ts` or CSS custom properties set from `OrganizationBranding`**
- **QR codes must be embedded inline as base64 data URIs — no external image URLs**
