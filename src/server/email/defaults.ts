// Default TipTap JSON templates for all 9 email events.
// Mirrors the current hardcoded HTML, converted to TipTap document format.

interface DefaultTemplate {
  name: string;
  description: string;
  subject: string;
  previewText: string;
  content: Record<string, unknown>;
}

export const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
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
        { type: "paragraph" },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Camper: " },
          { type: "text", text: "{{camper_name}}" },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Camp: " },
          { type: "text", text: "{{camp_name}}" },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Centre: " },
          { type: "text", text: "{{centre_name}}" },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Registration Number: " },
          { type: "text", text: "{{registration_number}}" },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Tribe: " },
          { type: "text", text: "{{tribe_name}}" },
        ] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "Please present the QR code below during check-in." }] },
        { type: "paragraph", content: [{ type: "text", text: "{{qr_code}}" }] },
        { type: "emailButton", attrs: { label: "View Registration", href: "{{registration_url}}" } },
      ],
    },
  },

  REGISTRATION_REJECTED: {
    name: "Registration Rejected",
    description: "Sent when a camper's registration is rejected",
    subject: "Update on your registration for {{camp_name}}",
    previewText: "An update regarding your registration.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Registration Update" }] },
        { type: "paragraph", content: [
          { type: "text", text: "Your registration for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camper_name}}" },
          { type: "text", text: " to " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: " was not approved." },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Reason: " },
          { type: "text", text: "{{rejection_reason}}" },
        ] },
      ],
    },
  },

  REGISTRATION_SUBMITTED: {
    name: "Registration Submitted",
    description: "Sent when a parent submits a registration",
    subject: "Registration received: {{camper_name}}",
    previewText: "Your registration has been received and is pending review.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Registration Received" }] },
        { type: "paragraph", content: [{ type: "text", text: "Dear Parent," }] },
        { type: "paragraph", content: [
          { type: "text", text: "We have successfully received the registration for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camper_name}}" },
          { type: "text", text: " to attend " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: "." },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "Please note that this registration is currently pending review and approval by our camp administration. We will verify the details and documents shortly and notify you via email once a decision has been made." }] },
        { type: "paragraph", content: [{ type: "text", text: "If we require any changes or additional information, we will send you a correction request with instructions." }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "Thank you,\nThe Camply Team" }] },
      ],
    },
  },

  CORRECTION_REQUESTED: {
    name: "Correction Requested",
    description: "Sent when admin requests corrections to a registration",
    subject: "Action needed for {{camper_name}}'s registration",
    previewText: "We need more information for your registration.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Action Needed" }] },
        { type: "paragraph", content: [
          { type: "text", text: "We need more information for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camper_name}}" },
          { type: "text", text: "'s registration to " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: ":" },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "{{correction_message}}" }] },
        { type: "emailButton", attrs: { label: "Update Registration", href: "{{registration_url}}" } },
      ],
    },
  },

  REGISTRATION_WAITLISTED: {
    name: "Waitlisted",
    description: "Sent when a camper is placed on the waitlist",
    subject: "{{camper_name}} is on the waitlist for {{camp_name}}",
    previewText: "You've been placed on the waitlist.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Waitlisted" }] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "{{camper_name}}" },
          { type: "text", text: " is currently on the waitlist for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: ". We'll notify you if a space opens up." },
        ] },
      ],
    },
  },

  STAFF_APPROVED: {
    name: "Staff Approved",
    description: "Sent when a teacher or volunteer application is approved",
    subject: "You're approved as a {{staff_role}} for {{camp_name}}!",
    previewText: "Welcome to the team!",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome to the team!" }] },
        { type: "paragraph", content: [
          { type: "text", text: "Hi {{staff_name}}, your " },
          { type: "text", marks: [{ type: "bold" }], text: "{{staff_role}}" },
          { type: "text", text: " registration for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: " has been approved." },
        ] },
        { type: "emailButton", attrs: { label: "Go to your dashboard", href: "{{dashboard_url}}" } },
      ],
    },
  },

  STAFF_REJECTED: {
    name: "Staff Rejected",
    description: "Sent when a teacher or volunteer application is rejected",
    subject: "Update on your {{staff_role}} registration for {{camp_name}}",
    previewText: "An update regarding your staff application.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Application Update" }] },
        { type: "paragraph", content: [
          { type: "text", text: "Hi {{staff_name}}, your " },
          { type: "text", marks: [{ type: "bold" }], text: "{{staff_role}}" },
          { type: "text", text: " registration for " },
          { type: "text", marks: [{ type: "bold" }], text: "{{camp_name}}" },
          { type: "text", text: " was not approved." },
        ] },
        { type: "paragraph", content: [
          { type: "text", marks: [{ type: "bold" }], text: "Reason: " },
          { type: "text", text: "{{rejection_reason}}" },
        ] },
      ],
    },
  },

  OTP_EMAIL: {
    name: "OTP Code",
    description: "Sent when a user requests a one-time password",
    subject: "Your OTP Code",
    previewText: "Your verification code is inside.",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "Your OTP code is: " },
          { type: "text", marks: [{ type: "bold" }], text: "{{otp_code}}" },
        ] },
        { type: "paragraph", content: [{ type: "text", text: "This code expires in 10 minutes." }] },
      ],
    },
  },

  WELCOME_EMAIL: {
    name: "Welcome Email",
    description: "Sent to new users to verify their email address",
    subject: "Welcome to Camply — verify your email",
    previewText: "Verify your email to get started.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome to Camply!" }] },
        { type: "paragraph", content: [{ type: "text", text: "Your account has been created. Please verify your email address by clicking the link below:" }] },
        { type: "emailButton", attrs: { label: "Verify your email", href: "{{verify_url}}" } },
        { type: "paragraph", content: [{ type: "text", text: "Or copy and paste this link into your browser:" }] },
        { type: "paragraph", content: [{ type: "text", text: "{{verify_url}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "Once verified, you'll be able to complete your camper's registration." }] },
      ],
    },
  },
};

/** All 9 event keys in a convenient array */
export const ALL_EVENT_KEYS = [
  "REGISTRATION_APPROVED",
  "REGISTRATION_REJECTED",
  "REGISTRATION_SUBMITTED",
  "CORRECTION_REQUESTED",
  "REGISTRATION_WAITLISTED",
  "STAFF_APPROVED",
  "STAFF_REJECTED",
  "OTP_EMAIL",
  "WELCOME_EMAIL",
] as const;

export type EmailEventKey = (typeof ALL_EVENT_KEYS)[number];
