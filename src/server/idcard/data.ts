import type { Prisma } from "@prisma/client";
import type { CampIdCardData } from "./renderCard";

// Prisma include shape for building CampIdCardData from a Registration —
// sibling to CAMP_INVITATION_INCLUDE in src/server/email/campaign/personalize.ts,
// extended with camper.gender (not needed there, needed here).
export const ID_CARD_INCLUDE = {
  camper: { select: { name: true, gender: true, userId: true } },
  camp: {
    select: {
      name: true,
      year: true,
      logoUrl: true,
      organization: { select: { branding: { select: { logoUrl: true } } } },
    },
  },
  campus: { select: { name: true } },
  tribe: { select: { name: true, color: true } },
} satisfies Prisma.RegistrationInclude;

export type RegistrationForIdCard = Prisma.RegistrationGetPayload<{
  include: typeof ID_CARD_INCLUDE;
}> & {
  qrToken: string | null;
  registrationNumber: string | null;
};

/**
 * Builds the ID card data from a registration, or null if the card can't be
 * rendered yet — not approved (no qrToken/registrationNumber), or no tribe
 * assigned (the card requires a tribe-color header band).
 */
export function buildCampIdCardData(registration: RegistrationForIdCard): CampIdCardData | null {
  if (!registration.qrToken || !registration.registrationNumber) return null;
  if (!registration.tribe) return null;

  return {
    camperName: registration.camper.name,
    campusName: registration.campus?.name ?? "—",
    gender: registration.camper.gender,
    tribeName: registration.tribe.name,
    tribeColor: registration.tribe.color ?? "#1E3A8A",
    campName: registration.camp.name,
    campYear: String(registration.camp.year),
    logoUrl: registration.camp.logoUrl ?? registration.camp.organization?.branding?.logoUrl ?? null,
    qrToken: registration.qrToken,
  };
}
