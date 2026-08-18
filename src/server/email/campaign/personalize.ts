// Per-registration variable resolution for personalized (certificate-style)
// campaigns — e.g. Camp Invitation. Distinct from the campaign sender's
// existing shared, org-level `variables` object (organization_name,
// support_email, etc.), which stays unchanged for ordinary broadcasts.
//
// Mirrors the variable set src/server/registration/effects.ts already
// builds for the REGISTRATION_APPROVED email, plus hostel/room/bed —
// omitted entirely when accommodation hasn't been assigned yet (confirmed
// decision: no placeholder text, the row just doesn't render).

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

export interface PersonalizedRecipient {
  registrationId: string;
  parentUserId: string;
  email: string;
  variables: Record<string, string>;
  qrSrc?: string;
}

/** Prisma `include` shape required to build personalized Camp Invitation
 * variables — reused by both the recipient-resolution query and any
 * ad-hoc single-registration render (e.g. a test-send). */
export const CAMP_INVITATION_INCLUDE = {
  camper: { select: { name: true, gender: true, userId: true, user: { select: { email: true } } } },
  camp: {
    select: {
      name: true,
      year: true,
      logoUrl: true,
      arrivalDate: true,
      organization: {
        select: { slug: true, branding: { select: { logoUrl: true, idCardEnabled: true } } },
      },
    },
  },
  campus: { select: { name: true } },
  tribe: { select: { name: true, color: true } },
  room: { select: { name: true, hostel: { select: { name: true } } } },
  bed: { select: { label: true } },
} as const;

type RegistrationWithCampInvitationData = {
  id: string;
  registrationNumber: string | null;
  qrToken: string | null;
  camper: { name: string; gender?: string | null; userId: string; user: { email: string } };
  camp: {
    name: string;
    year?: number;
    logoUrl?: string | null;
    organization: { slug: string; branding?: { logoUrl: string | null; idCardEnabled: boolean } | null } | null;
    arrivalDate: Date | null;
  };
  campus: { name: string };
  tribe: { name: string; color: string } | null;
  room: { name: string; hostel: { name: string } | null } | null;
  bed: { label: string } | null;
};

export function buildCampInvitationVariables(registration: RegistrationWithCampInvitationData): PersonalizedRecipient | null {
  const email = registration.camper.user?.email;
  if (!email || !registration.registrationNumber) return null;

  const qrSrc = registration.qrToken ? `${APP_URL}/api/qr/${registration.qrToken}` : undefined;

  const variables: Record<string, string> = {
    camper_name: registration.camper.name,
    camp_name: registration.camp.name,
    centre_name: registration.campus.name,
    registration_number: registration.registrationNumber,
    reporting_date: registration.camp.arrivalDate?.toDateString() ?? "",
    tribe_name: registration.tribe?.name ?? "",
    tribe_color: registration.tribe?.color ?? "",
    organization_name: registration.camp.organization?.slug ?? "",
  };

  // Derive check-in date, time, and location from camp.arrivalDate + campus
  const arrival = registration.camp.arrivalDate;
  if (arrival) {
    const hasTime = arrival.getHours() !== 0 || arrival.getMinutes() !== 0;
    variables.checkin_date = arrival.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    variables.arrive_before = hasTime
      ? arrival.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      : "7:00 AM";
  }
  variables.checkin_location = registration.campus.name;

  // Confirmed decision: omit entirely, no placeholder, until both are set.
  if (registration.room?.name && registration.room.hostel?.name) {
    variables.hostel_name = registration.room.hostel.name;
    variables.room_name = registration.room.name;
    if (registration.bed?.label) variables.bed_label = registration.bed.label;
  }

  return {
    registrationId: registration.id,
    parentUserId: registration.camper.userId,
    email,
    variables,
    qrSrc,
  };
}
