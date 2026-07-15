// Per-event email assemblers — compose components into complete emails for each event type.
// Each assembler receives variables (from template interpolation) + branding + optional extra params.

import type { Branding } from "../renderer";
import {
  EmailLayout,
  EmailHero,
  StatusBanner,
  Headline,
  Subheading,
  BodyText,
  InfoCard,
  QRCodeCard,
  Timeline,
  AlertCard,
  PrimaryButton,
  SecondaryButton,
  SupportCard,
  EmailFooter,
  NextSteps,
  Divider,
  Section,
} from "../components";
import type { StatusType } from "../components/cards";

interface AssemblerParams {
  variables: Record<string, string>;
  branding: Branding | null;
  /** Body content HTML rendered from TipTap */
  bodyContent?: string;
  /** Base64 data URL for QR code image (acceptance emails only) */
  qrDataUrl?: string;
}

// ─── Helper: build info rows for registration ───────────────────────────────

function regInfoRows(v: Record<string, string>) {
  const rows: { label: string; value: string }[] = [];
  if (v.camper_name) rows.push({ label: "Camper", value: v.camper_name });
  if (v.camp_name) rows.push({ label: "Camp", value: v.camp_name });
  if (v.centre_name) rows.push({ label: "Campus", value: v.centre_name });
  if (v.reporting_date) rows.push({ label: "Reporting Date", value: v.reporting_date });
  if (v.registration_number) rows.push({ label: "Registration #", value: v.registration_number });
  if (v.tribe_name) rows.push({ label: "Tribe", value: v.tribe_name });
  return rows;
}

// ─── REGISTRATION_APPROVED ──────────────────────────────────────────────────

export function buildApprovedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "🎉" }),
    StatusBanner({ type: "success", title: "Registration Approved", subtitle: `${v.camper_name || "Camper"} has been approved for ${v.camp_name || "camp"}.` }),
    InfoCard({ rows: regInfoRows(v) }),
    p.qrDataUrl ? QRCodeCard({ qrDataUrl: p.qrDataUrl, registrationNumber: v.registration_number || "" }) : "",
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    PrimaryButton({ label: "View Registration", href: v.registration_url || "/dashboard" }),
    NextSteps({ steps: ["Save this email for check-in", "Present the QR code at check-in", "Arrive before the reporting time", "Bring any required items listed in your welcome packet"] }),
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Approved for ${v.camp_name || "camp"}` });
}

// ─── REGISTRATION_SUBMITTED ─────────────────────────────────────────────────

export function buildSubmittedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "📋" }),
    StatusBanner({ type: "info", title: "Registration Received", subtitle: "Your registration has been received and is pending review." }),
    InfoCard({ rows: regInfoRows(v).filter(r => ["Camper", "Camp", "Registration #"].includes(r.label)) }),
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    PrimaryButton({ label: "View Registration", href: v.registration_url || "/dashboard" }),
    BodyText({ text: "We will review your registration and notify you of the outcome within 3–5 business days.", align: "center", color: undefined }),
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Registration received for ${v.camper_name || "camper"}` });
}

// ─── CORRECTION_REQUESTED ───────────────────────────────────────────────────

export function buildCorrectionEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "📝" }),
    StatusBanner({ type: "warning", title: "Action Required", subtitle: "Additional information is needed to complete your registration." }),
    AlertCard({ type: "warning", title: "Correction Needed", message: v.correction_message || "Please update your registration with the requested information." }),
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    PrimaryButton({ label: "Continue Registration", href: v.registration_url || "/dashboard" }),
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: "Action needed for your registration" });
}

// ─── REGISTRATION_REJECTED ──────────────────────────────────────────────────

export function buildRejectedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "📄" }),
    StatusBanner({ type: "danger", title: "Registration Not Approved", subtitle: `Unfortunately, ${v.camper_name || "your camper"}'s registration was not approved.` }),
    v.rejection_reason ? BodyText({ text: `Reason: ${v.rejection_reason}` }) : "",
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Update on ${v.camper_name || "your"}'s registration` });
}

// ─── REGISTRATION_WAITLISTED ────────────────────────────────────────────────

export function buildWaitlistedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "⏳" }),
    StatusBanner({ type: "warning", title: "Waitlisted", subtitle: `${v.camper_name || "Camper"} is on the waitlist for ${v.camp_name || "camp"}.` }),
    BodyText({ text: "Your registration is valid, but the camp is currently at full capacity. We will contact you if a space becomes available.", align: "center" }),
    InfoCard({ rows: regInfoRows(v).filter(r => ["Camper", "Camp"].includes(r.label)) }),
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Waitlisted for ${v.camp_name || "camp"}` });
}

// ─── STAFF_APPROVED ─────────────────────────────────────────────────────────

export function buildStaffApprovedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "🎉" }),
    StatusBanner({ type: "success", title: "Staff Application Approved", subtitle: `You've been approved as a ${v.staff_role || "staff"} for ${v.camp_name || "camp"}!` }),
    InfoCard({ rows: [{ label: "Name", value: v.staff_name || "" }, { label: "Role", value: v.staff_role || "" }, { label: "Camp", value: v.camp_name || "" }].filter(r => r.value) }),
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    PrimaryButton({ label: "Go to Dashboard", href: v.dashboard_url || "/dashboard" }),
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Approved as ${v.staff_role || "staff"}` });
}

// ─── STAFF_REJECTED ─────────────────────────────────────────────────────────

export function buildStaffRejectedEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "📄" }),
    StatusBanner({ type: "danger", title: "Application Not Approved", subtitle: `Your ${v.staff_role || "staff"} application was not approved.` }),
    v.rejection_reason ? BodyText({ text: `Reason: ${v.rejection_reason}` }) : "",
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    SupportCard({ supportEmail: p.branding?.supportEmail, supportPhone: p.branding?.supportPhone, websiteUrl: p.branding?.websiteUrl }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Update on your ${v.staff_role || "staff"} application` });
}

// ─── WELCOME_EMAIL ──────────────────────────────────────────────────────────

export function buildWelcomeEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "👋" }),
    Headline({ text: "Welcome to Camply!" }),
    BodyText({ text: "Your account has been created. Please verify your email address to get started.", align: "center" }),
    PrimaryButton({ label: "Verify Your Email", href: v.verify_url || "#" }),
    BodyText({ text: "Or copy and paste this link into your browser:", align: "center", color: undefined }),
    BodyText({ text: v.verify_url || "", align: "center", color: undefined }),
    p.bodyContent ? Section({ children: p.bodyContent }) : "",
    NextSteps({ steps: ["Verify your email address", "Create a camper profile", "Register for a camp"] }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: "Welcome to Camply — verify your email" });
}

// ─── OTP_EMAIL ──────────────────────────────────────────────────────────────

export function buildOtpEmail(p: AssemblerParams): string {
  const v = p.variables;
  const content = [
    EmailHero({ illustration: "🔐" }),
    Headline({ text: "Your OTP Code" }),
    Section({ children: `
      <div style="text-align:center;font-size:36px;font-weight:700;font-family:${"Inter, -apple-system, sans-serif"};color:#171717;letter-spacing:8px;padding:16px 0;">${v.otp_code || ""}</div>
    ` }),
    BodyText({ text: "This code expires in 10 minutes.", align: "center" }),
    BodyText({ text: "If you did not request this code, please ignore this email.", align: "center", color: undefined }),
    EmailFooter({ branding: p.branding }),
  ].filter(Boolean).join("\n");
  return EmailLayout({ content, branding: p.branding, previewText: `Your OTP code: ${v.otp_code || ""}` });
}
