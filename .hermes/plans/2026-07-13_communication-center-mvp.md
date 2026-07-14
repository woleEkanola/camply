# Communication Center MVP — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an admin interface (Communication Center) on top of Camply's existing email infrastructure. Non-technical admins can toggle email events, edit templates with a TipTap editor, configure per-org branding, and send broadcast emails — all without touching code.

**Architecture:** Five new admin pages under `/admin/communication/*` inside the existing `AppShell`. New Prisma models (`EmailEventConfig`, `EmailTemplate`, `OrganizationBranding`, `Broadcast`, `BroadcastRecipient`) augment the existing system. A template renderer loads TipTap JSON, interpolates variables, wraps with branding, and produces HTML. Broadcasts reuse the `SideEffect` outbox. The existing 9 email functions switch from hardcoded HTML to template-driven rendering.

**Tech Stack:** Next.js 16 (App Router), tRPC, Prisma, TipTap (React), @headlessui/react (existing Drawer), Resend (existing), Heroicons (existing)

**Files created:** ~30 new files across admin pages, API routers, Prisma schema additions, template engine, and migrations.
**Files modified:** ~8 existing files (navConfig, email functions, Prisma schema, tRPC index).

---

## Phase 0: Prisma Schema & Database

### Task 0.1: Add EmailEventConfig model

**Objective:** Create the model that controls whether each email trigger is enabled, which template it uses, and which channels/recipients are active.

**Files:**
- Modify: `prisma/schema.prisma` — add `EmailEventConfig` model after existing models

**Code:**

```prisma
model EmailEventConfig {
  id             String   @id @default(cuid())
  organizationId String
  event          String   // "REGISTRATION_APPROVED" | "REGISTRATION_REJECTED" | "REGISTRATION_SUBMITTED" | "CORRECTION_REQUESTED" | "REGISTRATION_WAITLISTED" | "STAFF_APPROVED" | "STAFF_REJECTED" | "OTP_EMAIL" | "WELCOME_EMAIL"
  enabled        Boolean  @default(true)
  templateId     String?
  template       EmailTemplate? @relation(fields: [templateId], references: [id])
  channels       Json     @default("[\"EMAIL\", \"IN_APP\"]") // ["EMAIL", "IN_APP"]
  recipients     Json     @default("[\"PARENT\"]") // ["PARENT", "CAMPER", "TEACHER", "VOLUNTEER", "EMERGENCY_CONTACT"]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, event])
  @@index([organizationId])
}
```

**Step 1:** Add model to `prisma/schema.prisma`
**Step 2:** Run `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > migration_email_event_config.sql`
**Step 3:** Run `npx prisma migrate deploy`
**Step 4:** Run `prisma generate`

### Task 0.2: Add EmailTemplate model

**Objective:** Store reusable email templates with TipTap JSON content.

**Files:**
- Modify: `prisma/schema.prisma` — add `EmailTemplate` model

**Code:**

```prisma
model EmailTemplate {
  id             String              @id @default(cuid())
  organizationId String
  name           String              // "Registration Approved", "Welcome", etc.
  description    String?             // What this template is used for
  subject        String              // "You're approved for {{camp_name}}!"
  previewText    String?             // Email client preview text
  content        Json                // TipTap JSON
  isDefault      Boolean             @default(false) // System default template
  active         Boolean             @default(true)
  eventConfigs   EmailEventConfig[]  // Events using this template
  deletedAt      DateTime?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@unique([organizationId, name])
  @@index([deletedAt])
}
```

**Step 1:** Add model
**Step 2:** Generate migration SQL, deploy, regenerate

### Task 0.3: Add OrganizationBranding model

**Objective:** Per-organization email branding settings.

**Files:**
- Modify: `prisma/schema.prisma` — add `OrganizationBranding` model

**Code:**

```prisma
model OrganizationBranding {
  id             String       @id @default(cuid())
  organizationId String       @unique
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  logoUrl        String?      // URL to org logo (via UploadThing)
  primaryColor   String       @default("#E67E22") // accent / primary brand color
  accentColor    String       @default("#E67E22")
  buttonColor    String       @default("#E67E22")
  headerImageUrl String?      // Optional header image
  footerText     String?      // e.g. "© 2026 Grace Community Church"
  supportEmail   String?
  supportPhone   String?
  websiteUrl     String?
  facebookUrl    String?
  instagramUrl   String?
  address        String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

**Step 1:** Add model
**Step 2:** Generate migration SQL, deploy, regenerate

### Task 0.4: Add Broadcast + BroadcastRecipient models

**Objective:** Store broadcast campaigns and per-recipient delivery state.

**Files:**
- Modify: `prisma/schema.prisma` — add models

**Code:**

```prisma
model Broadcast {
  id             String                @id @default(cuid())
  organizationId String
  title          String                // Internal name (e.g. "Summer Packing List")
  subject        String                // Email subject
  body           Json                  // TipTap JSON
  audience       String                // "PARENTS" | "TEACHERS" | "VOLUNTEERS" | "ALL"
  campId         String?               // Optional filter
  campusId       String?               // Optional filter
  status         String                @default("DRAFT") // DRAFT | SENDING | COMPLETED | FAILED
  createdById    String
  sentAt         DateTime?
  completedAt    DateTime?
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt
  recipients     BroadcastRecipient[]

  @@index([organizationId, status])
}

model BroadcastRecipient {
  id          String    @id @default(cuid())
  broadcastId String
  broadcast   Broadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  recipientId String    // userId
  email       String
  status      String    @default("QUEUED") // QUEUED | SENT | FAILED
  sideEffectId String?  // Link to SideEffect row for retry tracking
  queuedAt    DateTime  @default(now())
  sentAt      DateTime?
  failedAt    DateTime?
  error       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([broadcastId, status])
}
```

**Step 1:** Add models
**Step 2:** Generate migration SQL, deploy, regenerate

### Task 0.5: Extend SideEffect model for broadcasts

**Objective:** The existing `SideEffect` model has `registrationId` (required). Add optional `broadcastRecipientId` so broadcast effects can also use the outbox.

**Files:**
- Modify: `prisma/schema.prisma` — update SideEffect model

**Changes:**
```prisma
model SideEffect {
  id                    String   @id @default(cuid())
  registrationId        String?
  broadcastRecipientId  String?  // NEW: link to BroadcastRecipient
  type                  String   // REGISTRATION_APPROVED | BROADCAST_SEND | ...
  status                String   @default("QUEUED")
  attempts              Int      @default(0)
  lastError             String?
  runAfter              DateTime @default(now())
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([status, runAfter])
}
```

Make `registrationId` optional via a migration that drops the NOT NULL constraint.

**Step 1:** Update model
**Step 2:** Generate migration SQL, deploy, regenerate

---

## Phase 1: Template Rendering Engine

### Task 1.1: Create variable registry

**Objective:** Define all available template variables with sample data for preview.

**Files:**
- Create: `src/server/email/variables.ts`

**Code:**

```typescript
export interface EmailVariable {
  key: string;           // "camper_name"
  label: string;         // "Camper Name"
  category: "camper" | "parent" | "camp" | "registration" | "staff" | "organization" | "other";
  sampleValue: string;   // "Sarah Johnson"
}

export const EMAIL_VARIABLES: EmailVariable[] = [
  // Parent
  { key: "parent_name", label: "Parent Name", category: "parent", sampleValue: "Sarah Johnson" },
  { key: "parent_email", label: "Parent Email", category: "parent", sampleValue: "sarah@example.com" },
  { key: "parent_first_name", label: "Parent First Name", category: "parent", sampleValue: "Sarah" },
  // Camper
  { key: "camper_name", label: "Camper Name", category: "camper", sampleValue: "Daniel Johnson" },
  { key: "camper_first_name", label: "Camper First Name", category: "camper", sampleValue: "Daniel" },
  { key: "camper_age", label: "Camper Age", category: "camper", sampleValue: "16" },
  // Camp
  { key: "camp_name", label: "Camp Name", category: "camp", sampleValue: "Teen Camp 2026" },
  { key: "centre_name", label: "Centre Name", category: "camp", sampleValue: "Lekki Centre" },
  { key: "reporting_date", label: "Reporting Date", category: "camp", sampleValue: "August 14, 2026" },
  // Registration
  { key: "registration_number", label: "Registration Number", category: "registration", sampleValue: "TC26-LEK-0042" },
  { key: "registration_url", label: "Registration URL", category: "registration", sampleValue: "https://app.camply.ng/dashboard/register/abc123" },
  { key: "qr_code", label: "QR Code", category: "registration", sampleValue: "[QR Code Image]" },
  // Approval / Rejection
  { key: "approval_reason", label: "Approval Reason", category: "registration", sampleValue: "All documents verified" },
  { key: "rejection_reason", label: "Rejection Reason", category: "registration", sampleValue: "Age requirement not met" },
  { key: "correction_message", label: "Correction Message", category: "registration", sampleValue: "Please upload a valid birth certificate" },
  // Tribe
  { key: "tribe_name", label: "Tribe Name", category: "camp", sampleValue: "Tribe of Judah" },
  { key: "tribe_color", label: "Tribe Color", category: "camp", sampleValue: "#E53935" },
  // Organization
  { key: "organization_name", label: "Organization Name", category: "organization", sampleValue: "Grace Community Church" },
  // Staff
  { key: "staff_name", label: "Staff Name", category: "staff", sampleValue: "John Okafor" },
  { key: "staff_role", label: "Staff Role", category: "staff", sampleValue: "Teacher" },
  { key: "dashboard_url", label: "Dashboard URL", category: "other", sampleValue: "https://app.camply.ng/teacher" },
  // OTP
  { key: "otp_code", label: "OTP Code", category: "other", sampleValue: "482917" },
  { key: "verify_url", label: "Verify URL", category: "other", sampleValue: "https://app.camply.ng/api/auth/verify-email?token=abc123" },
  // Generic
  { key: "support_email", label: "Support Email", category: "organization", sampleValue: "help@gracechurch.org" },
  { key: "support_phone", label: "Support Phone", category: "organization", sampleValue: "+234 800 000 0000" },
];

/** Returns sample data for every variable — used for preview rendering */
export function getSampleData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const v of EMAIL_VARIABLES) {
    data[v.key] = v.sampleValue;
  }
  return data;
}
```

**Verification:** `npx tsc --noEmit` clean.

### Task 1.2: Create template renderer

**Objective:** Load TipTap JSON, interpolate variables, wrap with branding HTML, return final HTML string.

**Files:**
- Create: `src/server/email/renderer.ts`

**Code:**

```typescript
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
// Custom button extension (TipTap node → renders as branded <a> button)
import { ButtonExtension } from "./buttonExtension";

interface Branding {
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  buttonColor: string;
  headerImageUrl?: string | null;
  footerText?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  address?: string | null;
}

/**
 * Render TipTap JSON content to HTML with variable interpolation.
 */
export function renderTemplateContent(tiptapJson: any, variables: Record<string, string>): string {
  let html = generateHTML(tiptapJson, [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: true }),
    Image,
    ButtonExtension,
  ]);
  
  // Interpolate {{variables}}
  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, value ?? "");
  }
  
  return html;
}

/**
 * Wrap content HTML in the full email layout with branding.
 */
export function wrapWithBranding(contentHtml: string, branding: Branding): string {
  const logoRow = branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:60px;margin-bottom:16px;" />` : "";
  const headerImage = branding.headerImageUrl ? `<img src="${branding.headerImageUrl}" alt="" style="width:100%;max-width:480px;margin-bottom:16px;" />` : "";
  
  const socialLinks: string[] = [];
  if (branding.websiteUrl) socialLinks.push(`<a href="${branding.websiteUrl}" style="color:${branding.accentColor};">Website</a>`);
  if (branding.facebookUrl) socialLinks.push(`<a href="${branding.facebookUrl}" style="color:${branding.accentColor};">Facebook</a>`);
  if (branding.instagramUrl) socialLinks.push(`<a href="${branding.instagramUrl}" style="color:${branding.accentColor};">Instagram</a>`);
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          ${headerImage ? `<tr><td>${headerImage}</td></tr>` : ""}
          <tr>
            <td style="padding:24px 24px 0;">
              ${logoRow}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${contentHtml}
            </td>
          </tr>
          ${branding.footerText || branding.address || socialLinks.length > 0 ? `
          <tr>
            <td style="padding:24px;border-top:1px solid #eeeeee;font-size:12px;color:#888888;">
              ${branding.footerText ? `<p style="margin:0 0 8px;">${branding.footerText}</p>` : ""}
              ${branding.address ? `<p style="margin:0 0 8px;">${branding.address}</p>` : ""}
              ${socialLinks.length > 0 ? `<p style="margin:0;">${socialLinks.join(" &middot; ")}</p>` : ""}
              ${branding.supportEmail ? `<p style="margin:8px 0 0;">Contact: <a href="mailto:${branding.supportEmail}" style="color:${branding.accentColor};">${branding.supportEmail}</a></p>` : ""}
            </td>
          </tr>
          ` : ""}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Full render pipeline: TipTap JSON → variables → content HTML → brand wrapping → final HTML.
 */
export async function renderEmail(params: {
  tiptapJson: any;
  variables: Record<string, string>;
  branding: Branding;
}): Promise<string> {
  const content = renderTemplateContent(params.tiptapJson, params.variables);
  return wrapWithBranding(content, params.branding);
}
```

**Step 1:** Create file
**Step 2:** Run `npx tsc --noEmit`

### Task 1.3: Create TipTap button extension

**Objective:** Custom TipTap node that renders a branded CTA button in emails.

**Files:**
- Create: `src/server/email/buttonExtension.ts`

**Implementation:** A simple TipTap Node extension that stores `label` and `href` attributes, and renders as a styled `<a>` tag during `generateHTML()`. For the editor, it renders as an inline button component.

```typescript
import { Node } from "@tiptap/core";

export interface ButtonOptions {
  label: string;
  href: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailButton: {
      insertEmailButton: (options: ButtonOptions) => ReturnType;
    };
  }
}

export const ButtonExtension = Node.create({
  name: "emailButton",
  group: "block",
  atom: true,
  
  addAttributes() {
    return {
      label: { default: "Click here" },
      href: { default: "#" },
    };
  },
  
  parseHTML() {
    return [{ tag: "a[data-email-button]" }];
  },
  
  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      {
        "data-email-button": "",
        href: HTMLAttributes.href,
        style: `display:inline-block;background-color:var(--brand-button,#E67E22);color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;`,
      },
      HTMLAttributes.label,
    ];
  },
  
  addCommands() {
    return {
      insertEmailButton:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
```

**Step 1:** Create file
**Step 2:** `npx tsc --noEmit`

### Task 1.4: Create template loader utility

**Objective:** Load event config + template + branding from DB, returning everything needed to send an email.

**Files:**
- Create: `src/server/email/templateLoader.ts`

**Code:**

```typescript
import { prisma } from "@/server/db";
import type { Branding } from "./renderer";

export interface LoadedTemplate {
  subject: string;
  tiptapJson: any;
  branding: Branding | null;
  enabled: boolean;
  channels: string[];
}

/**
 * Load the template configuration for a given event in an organization.
 * Returns null if the event is disabled.
 */
export async function loadTemplateForEvent(
  organizationId: string,
  event: string
): Promise<LoadedTemplate | null> {
  const config = await prisma.emailEventConfig.findUnique({
    where: { organizationId_event: { organizationId, event } },
    include: { template: true },
  });

  if (!config || !config.enabled) return null;

  const branding = await prisma.organizationBranding.findUnique({
    where: { organizationId },
  });

  return {
    subject: config.template?.subject ?? getDefaultSubject(event),
    tiptapJson: config.template?.content ?? getDefaultContent(event),
    branding: branding
      ? {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          buttonColor: branding.buttonColor,
          headerImageUrl: branding.headerImageUrl,
          footerText: branding.footerText,
          supportEmail: branding.supportEmail,
          supportPhone: branding.supportPhone,
          websiteUrl: branding.websiteUrl,
          facebookUrl: branding.facebookUrl,
          instagramUrl: branding.instagramUrl,
          address: branding.address,
        }
      : null,
    enabled: config.enabled,
    channels: config.channels as string[],
  };
}

// Fallback defaults (mirror current hardcoded content)
function getDefaultSubject(event: string): string {
  const subjects: Record<string, string> = {
    REGISTRATION_APPROVED: "You're approved for {{camp_name}}!",
    REGISTRATION_REJECTED: "Update on your registration for {{camp_name}}",
    REGISTRATION_SUBMITTED: "Registration received: {{camper_name}}",
    CORRECTION_REQUESTED: "Action needed for {{camper_name}}'s registration",
    REGISTRATION_WAITLISTED: "{{camper_name}} is on the waitlist for {{camp_name}}",
    STAFF_APPROVED: "You're approved as a {{staff_role}} for {{camp_name}}!",
    STAFF_REJECTED: "Update on your {{staff_role}} registration for {{camp_name}}",
    OTP_EMAIL: "Your OTP Code",
    WELCOME_EMAIL: "Welcome to Camply — verify your email",
  };
  return subjects[event] ?? "Camply Notification";
}

function getDefaultContent(event: string): any {
  // Minimal TipTap JSON fallback — just a paragraph with key variables
  const messages: Record<string, string> = {
    REGISTRATION_APPROVED: "Congratulations! {{camper_name}} has been approved for {{camp_name}}.",
    REGISTRATION_REJECTED: "{{camper_name}}'s registration for {{camp_name}} was not approved. Reason: {{rejection_reason}}",
    REGISTRATION_SUBMITTED: "We have received {{camper_name}}'s registration for {{camp_name}}. It is pending review.",
    CORRECTION_REQUESTED: "We need more information for {{camper_name}}'s registration: {{correction_message}}",
    REGISTRATION_WAITLISTED: "{{camper_name}} is on the waitlist for {{camp_name}}.",
    STAFF_APPROVED: "Welcome! Your {{staff_role}} registration for {{camp_name}} has been approved.",
    STAFF_REJECTED: "Your {{staff_role}} registration for {{camp_name}} was not approved.",
    OTP_EMAIL: "Your OTP code is: {{otp_code}}",
    WELCOME_EMAIL: "Welcome! Please verify your email: {{verify_url}}",
  };
  const text = messages[event] ?? "Camply notification.";
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
```

**Step 1:** Create file
**Step 2:** `npx tsc --noEmit`

---

## Phase 2: tRPC Router — Communication

### Task 2.1: Create communication tRPC router

**Objective:** Full CRUD for email events, templates, branding, and broadcast.

**Files:**
- Create: `src/server/api/routers/communication.ts`

**Covered endpoints:**

```typescript
// Email Events
event.list         → List all 9 events for org (creates defaults if missing)
event.update       → Update enabled/templateId/channels/recipients for one event

// Templates
template.list       → List all templates for org
template.getById    → Get one template
template.create     → Create new template
template.update     → Update subject/previewText/content
template.delete     → Soft-delete template (unless it's the system default)
template.reset      → Reset a template to system default content

// Branding
branding.get        → Get org branding (creates defaults if missing)
branding.update     → Update branding

// Broadcast
broadcast.list      → List broadcasts for org (paginated)
broadcast.get       → Get one broadcast with recipient stats
broadcast.create    → Create broadcast (DRAFT)
broadcast.send      → Resolve audience → create BroadcastRecipients + SideEffects → update status to SENDING
broadcast.getStats  → Get recipient counts by status for a broadcast

// Preview
preview.render      → Take TipTap JSON + variables + branding → return rendered HTML
```

**Requirements:**
- All procedures use `protectedProcedure` with org-level auth (`assertOrgAdmin` for mutations)
- `event.list` seeds default configs if none exist for the org
- `template.reset` re-seeds a template to its system default
- `preview.render` is a query (no mutation) that renders TipTap JSON to HTML on-the-fly

**Step 1:** Create file with full implementation (~300 lines)
**Step 2:** `npx tsc --noEmit`

### Task 2.2: Register router in tRPC index

**Files:**
- Modify: `src/server/api/root.ts` or `src/server/api/routers/index.ts` (find the actual index)

**Add:**
```typescript
import { communicationRouter } from "./communication";

// In appRouter:
export const appRouter = createTRPCRouter({
  // ... existing
  communication: communicationRouter,
});
```

**Step 1:** Find the router index file
**Step 2:** Add import and registration
**Step 3:** `npx tsc --noEmit`

---

## Phase 3: Admin Pages

### Task 3.1: Update navigation config

**Files:**
- Modify: `src/components/layout/navConfig.ts`

**Change:** In `ADMIN_GROUPS`, replace the existing "Communication" group (lines 134-144) with the expanded version:

```typescript
{
  name: "Communication",
  items: [
    {
      name: "Overview",
      href: "/admin/communication",
      icon: MegaphoneIcon,
      roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
    },
    {
      name: "Email Events",
      href: "/admin/communication/events",
      icon: MegaphoneIcon, // swap to EnvelopeIcon if available
      roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
    },
    {
      name: "Templates",
      href: "/admin/communication/templates",
      icon: IdentificationIcon, // swap to DocumentTextIcon
      roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
    },
    {
      name: "Broadcast",
      href: "/admin/communication/broadcast",
      icon: MegaphoneIcon,
      roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
    },
    {
      name: "Branding",
      href: "/admin/communication/branding",
      icon: Cog6ToothIcon, // swap to PaintBrushIcon
      roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
    },
  ],
},
```

And remove the old "Announcements" item (or keep it under a different group if still needed).

**Step 1:** Update `navConfig.ts`
**Step 2:** `npx tsc --noEmit`

### Task 3.2: Communication Overview page

**Objective:** Landing page with 4 top cards + recent activity feed.

**Files:**
- Create: `src/app/admin/communication/page.tsx`

**Layout:**
- AppShell wrapper
- PageHeader: "Communication"
- 4-card grid: Email Events, Templates, Broadcast, Branding (each links to sub-page)
- "Recent Email Activity" list below — queries `api.communication.event.list` and shows each event with status indicator (green dot = ON, gray = OFF)

**Step 1:** Create file
**Step 2:** `npx tsc --noEmit`

### Task 3.3: Email Events page

**Objective:** Show all 9 email events as clean cards with toggle + edit drawer.

**Files:**
- Create: `src/app/admin/communication/events/page.tsx`
- Create: `src/app/admin/communication/events/EventCard.tsx`
- Create: `src/app/admin/communication/events/EventDrawer.tsx`

**Layout:**
- Events grouped into 3 sections: Authentication, Registration, Staff
- Each event: light card with title, description, assigned template name, recipient badge, ON/OFF toggle
- Click "Edit" → opens existing `Drawer` component with:
  - Read-only trigger info
  - Recipient checkboxes (Parent, Camper, Teacher, Volunteer, Emergency Contact)
  - Channel checkboxes (Email, In-App Notification)
  - Template dropdown (select from available templates)
  - Save / Cancel buttons

**Step 1:** Create all 3 files
**Step 2:** `npx tsc --noEmit`

### Task 3.4: Templates page

**Objective:** Left sidebar template list + TipTap editor + variables panel + preview cards.

**Files:**
- Create: `src/app/admin/communication/templates/page.tsx`
- Create: `src/app/admin/communication/templates/TemplateList.tsx`
- Create: `src/app/admin/communication/templates/TemplateEditor.tsx`
- Create: `src/app/admin/communication/templates/VariablesPanel.tsx`
- Create: `src/app/admin/communication/templates/PreviewCards.tsx`

**Layout:**
```
┌──────────┬──────────────────────────────────────┬─────────────┐
│ Template │ Subject: [________________]           │ Variables   │
│ List     │ Preview Text: [________________]      │             │
│          │                                       │ parent_name │
│ Welcome  │ ┌─────────────────────────────────┐  │ camper_name │
│ OTP      │ │ TipTap Editor                    │  │ camp_name   │
│ Approved │ │ (Bold/Italic/Heading/List/       │  │ ...         │
│ Rejected │ │  Link/Image/Variable buttons)    │  │             │
│ ...      │ │                                  │  │             │
│          │ └─────────────────────────────────┘  │             │
│          │                                       │             │
│          │ [Desktop Preview] [Mobile Preview]    │             │
└──────────┴──────────────────────────────────────┴─────────────┘
```

**TipTap editor config:** Use `@tiptap/react` with StarterKit, Underline, Link, Image extensions + custom `ButtonExtension`. The editor stores content as TipTap JSON via `onUpdate`.

**Preview cards:** Two side-by-side cards (tabs on mobile). Desktop = 480px fixed width, Mobile = 320px. Both render content through `api.communication.preview.render` with sample data.

**Step 1:** Create all 5 files
**Step 2:** Install `@tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-image @tiptap/html`
**Step 3:** `npx tsc --noEmit`

### Task 3.5: Branding page

**Objective:** Single form page with all branding fields.

**Files:**
- Create: `src/app/admin/communication/branding/page.tsx`

**Layout:**
- AppShell wrapper
- PageHeader: "Email Branding"
- Card with form fields:
  - Organization Logo (UploadThing file picker — reuse existing upload component)
  - Primary Color (color input)
  - Accent Color (color input)
  - Button Color (color input)
  - Header Image (optional, UploadThing)
  - Footer Text (textarea)
  - Support Email (input)
  - Support Phone (input)
  - Website URL (input)
  - Facebook URL (input)
  - Instagram URL (input)
  - Address (textarea)
- Email Preview card at bottom showing how branding looks on a sample email
- Save button

**Step 1:** Create file
**Step 2:** `npx tsc --noEmit`

### Task 3.6: Broadcast page

**Objective:** Create and send broadcast emails.

**Files:**
- Create: `src/app/admin/communication/broadcast/page.tsx`
- Create: `src/app/admin/communication/broadcast/BroadcastComposer.tsx`
- Create: `src/app/admin/communication/broadcast/BroadcastHistory.tsx`

**Layout:**
- Two tabs: "Compose" and "History"
- **Compose tab:**
  - Recipients: radio/checkbox (Parents / Teachers / Volunteers / Campers)
  - Optional filters: Camp dropdown, Centre dropdown, Status dropdown
  - Subject (input)
  - Message (TipTap editor, same config as templates)
  - [Send Test] button → sends to current user's email
  - [Send Now] button → calls `api.communication.broadcast.send`
  - Confirmation dialog showing resolved recipient count
- **History tab:**
  - Table of past broadcasts with status, recipient counts, date

**Step 1:** Create all 3 files
**Step 2:** `npx tsc --noEmit`

---

## Phase 4: Backend Integration — Wire Existing Email Functions

### Task 4.1: Update sendAcceptanceEmail to use template system

**Objective:** `sendAcceptanceEmail()` now loads template + branding from DB instead of hardcoded HTML.

**Files:**
- Modify: `src/server/email/sendAcceptanceEmail.ts`

**Approach:**
```typescript
export async function sendAcceptanceEmail(params: AcceptanceEmailParams) {
  // 1. Find organizationId from camper/camp
  const org = await prisma.registration.findUnique({
    where: { id: params.registrationId },
    select: { camp: { select: { organizationId: true } } },
  });
  
  // 2. Load template config
  const loaded = await loadTemplateForEvent(org.camp.organizationId, "REGISTRATION_APPROVED");
  if (!loaded) return; // Event disabled
  
  // 3. Build variables
  const variables = {
    camper_name: params.camperName,
    camp_name: params.campName,
    centre_name: params.centreName,
    registration_number: params.registrationNumber,
    reporting_date: params.reportingDate ?? "",
    tribe_name: params.tribeName ?? "",
    tribe_color: params.tribeColor ?? "",
    qr_code: params.qrDataUrl,
    // ... etc
  };
  
  // 4. Render
  const html = await renderEmail({
    tiptapJson: loaded.tiptapJson,
    variables,
    branding: loaded.branding ?? getDefaultBranding(),
  });
  
  // 5. Handle QR code special case — if template contains {{qr_code}}, inject as <img>
  //    (TipTap can't render base64 images in JSON, so we post-process)
  
  // 6. Send via Resend
  await resend.emails.send({
    from: params.orgSlug ? `${params.orgSlug}@camply.ng` : 'donotreply@camply.ng',
    to: params.to,
    subject: loaded.subject,
    html,
  });
}
```

**IMPORTANT:** This change must NOT break existing behavior. If no template config exists (pre-seed), fall back to current hardcoded HTML. The `loadTemplateForEvent` function will return null and the old code path runs.

**Step 1:** Refactor `sendAcceptanceEmail.ts`
**Step 2:** Do the same for `sendRejectionEmail`, `sendCorrectionEmail`, `sendWaitlistEmail`, `sendSubmissionEmail`
**Step 3:** Refactor `sendStaffApprovedEmail`, `sendStaffRejectedEmail` in `sendStaffEmails.ts`
**Step 4:** Refactor `sendOtpEmail.ts`
**Step 5:** Refactor `sendWelcomeEmail.ts`
**Step 6:** All existing vitest tests must pass

### Task 4.2: Update SideEffect sweep to handle broadcasts

**Objective:** The cron sweep at `POST /api/cron/effects` must also process `BROADCAST_SEND` type side effects.

**Files:**
- Modify: `src/server/registration/effects.ts` (or create new handler)

**Add a new case in `runEffect()`:**
```typescript
case "BROADCAST_SEND": {
  const recipient = await prisma.broadcastRecipient.findUnique({
    where: { id: effect.broadcastRecipientId! },
    include: { broadcast: true },
  });
  // Render email, send via Resend, update recipient status
}
```

**Step 1:** Add broadcast handling to effects system
**Step 2:** `npx tsc --noEmit`

---

## Phase 5: Seed Data & Default Templates

### Task 5.1: Create seed for default templates

**Objective:** On first load for an org, seed all 9 default templates with their current hardcoded content converted to TipTap JSON.

**Files:**
- Create: `src/server/email/defaults.ts`

**Content:** 9 TipTap JSON documents mirroring current hardcoded HTML (converted to TipTap paragraph/heading nodes).

**Example for "Registration Approved":**
```typescript
export const DEFAULT_TEMPLATES = {
  REGISTRATION_APPROVED: {
    name: "Registration Approved",
    description: "Sent when a camper's registration is approved",
    subject: "You're approved for {{camp_name}}!",
    previewText: "Congratulations! Your registration has been approved.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Congratulations!" }] },
        { type: "paragraph", content: [{ type: "text", text: "Your registration has been approved." }] },
        { type: "paragraph", content: [
          { type: "text", text: "Camper: " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camper_name}}" },
        ]},
        { type: "paragraph", content: [
          { type: "text", text: "Camp: " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
        ]},
        // ... etc
      ],
    },
  },
  // ... 8 more
};
```

**Step 1:** Create `defaults.ts`
**Step 2:** `npx tsc --noEmit`

### Task 5.2: Auto-seed logic in event.list

**Objective:** When `api.communication.event.list` is called and no rows exist for the org, auto-create 9 default `EmailEventConfig` rows + 9 default `EmailTemplate` rows + 1 default `OrganizationBranding` row.

**Step 1:** Add seeding logic to the `event.list` tRPC procedure
**Step 2:** Verify with `npx tsc --noEmit`

---

## Phase 6: Verification

### Task 6.1: Type check

```bash
npx tsc --noEmit
```
Expected: 0 errors.

### Task 6.2: Production build

```bash
rm -rf .next && npm run build
```
Expected: ✓ Compiled successfully.

### Task 6.3: Vitest tests

```bash
npm run test
```
All existing tests must pass. Add new tests for:
- `renderTemplateContent()` — variable interpolation
- `wrapWithBranding()` — branding wrapper
- `getSampleData()` — returns all keys
- `loadTemplateForEvent()` — returns null when disabled, returns config when enabled

### Task 6.4: Playwright E2E

Create new spec: `tests/communication-center.spec.ts`

Test flows:
1. Navigate to `/admin/communication` — verify 4 cards visible
2. Navigate to Email Events — verify 9 event cards visible, toggle works
3. Open event drawer — verify recipients, channels, template dropdown
4. Navigate to Templates — verify left sidebar, editor loads
5. Insert variable from panel — verify `{{camper_name}}` inserted
6. Navigate to Branding — update colors, verify preview updates
7. Navigate to Broadcast — compose, send test, verify test email received status

---

## Phase 7: Cleanup

### Task 7.1: Remove old Announcements page

If Announcements is superseded by Broadcast, either:
- Remove `src/app/admin/announcements/page.tsx`
- Or keep it and just move it elsewhere in nav

### Task 7.2: Update AGENTS.md

Add Communication Center section documenting the new models and architecture.

---

## Files Summary

### New Files (22+)

| Path | Purpose |
|---|---|
| `src/server/email/variables.ts` | Variable registry + sample data |
| `src/server/email/renderer.ts` | TipTap → HTML renderer + branding wrapper |
| `src/server/email/buttonExtension.ts` | TipTap custom button node |
| `src/server/email/templateLoader.ts` | DB → rendered config loader |
| `src/server/email/defaults.ts` | Default template TipTap JSON |
| `src/server/api/routers/communication.ts` | tRPC router |
| `src/app/admin/communication/page.tsx` | Overview page |
| `src/app/admin/communication/events/page.tsx` | Email Events list |
| `src/app/admin/communication/events/EventCard.tsx` | Event card component |
| `src/app/admin/communication/events/EventDrawer.tsx` | Edit event drawer |
| `src/app/admin/communication/templates/page.tsx` | Templates page |
| `src/app/admin/communication/templates/TemplateList.tsx` | Sidebar list |
| `src/app/admin/communication/templates/TemplateEditor.tsx` | TipTap editor |
| `src/app/admin/communication/templates/VariablesPanel.tsx` | Variable insertion |
| `src/app/admin/communication/templates/PreviewCards.tsx` | Desktop/mobile previews |
| `src/app/admin/communication/branding/page.tsx` | Branding form |
| `src/app/admin/communication/broadcast/page.tsx` | Broadcast page |
| `src/app/admin/communication/broadcast/BroadcastComposer.tsx` | Compose tab |
| `src/app/admin/communication/broadcast/BroadcastHistory.tsx` | History tab |
| `tests/communication-center.spec.ts` | Playwright E2E |

### Modified Files (9)

| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add 5 models, modify 1 |
| `src/components/layout/navConfig.ts` | Update Communication nav group |
| `src/server/api/root.ts` (or equivalent) | Register communication router |
| `src/server/email/sendAcceptanceEmail.ts` | Use template loader |
| `src/server/email/sendStaffEmails.ts` | Use template loader |
| `src/server/email/sendOtpEmail.ts` | Use template loader |
| `src/server/email/sendWelcomeEmail.ts` | Use template loader |
| `src/server/api/routers/staff.ts` | Adapt to template loader |
| `src/server/registration/effects.ts` | Add BROADCAST_SEND handler |

### New npm dependencies

```
@tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-image @tiptap/html
```

---

## Risk Mitigation

1. **Backward compatibility:** Every email function first checks for template config. If none exists (org hasn't been seeded), falls back to existing hardcoded HTML. No emails break on deploy.

2. **Migration safety:** All new Prisma models are additive. Only `SideEffect.registrationId` becomes optional (backward-compatible — existing rows have it set).

3. **Performance:** Template loading does 2 DB queries per email (event config + branding). For high-volume OTP emails, consider a short-lived cache layer post-MVP.

4. **TipTap server-side rendering:** `@tiptap/html` generates HTML from JSON server-side. Verify it works in Node.js runtime (no browser DOM needed). If it requires DOM, use `linkedom` or `jsdom` as a lightweight shim.

5. **QR code in templates:** QR codes are base64 images too large for TipTap JSON. Post-process the rendered HTML to inject `<img src="...">` for the `{{qr_code}}` variable after rendering.
