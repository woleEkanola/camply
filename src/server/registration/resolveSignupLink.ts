import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

/**
 * Resolves a camper SignupLink from a URL token, which is either the DB's
 * random hex token (legacy links) or the `{campus-slug}_{camp-slug}` format
 * the admin UI's "Copy Link" button actually generates (see
 * handleCopySignupLink in src/app/admin/campuses/page.tsx) — SignupLink.token
 * in the DB is always a random hex string (src/server/api/routers/
 * signupLink.ts's `generate`), so a bare `findUnique({ where: { token } })`
 * never matches a copied slug-format link. Every real parent signup was
 * failing at final submission with "Invalid or expired signup link" — the
 * email/OTP steps succeeded because they go through signupLink.validateToken,
 * which already had this same slug-fallback logic; /api/auth/signup didn't.
 * Both now share this one resolver so the two paths can't drift apart again.
 */
export async function resolveSignupLinkByToken(prisma: TxClient, token: string) {
  const slugCampMatch = token.match(/^([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)$/);
  if (slugCampMatch) {
    const [, campusSlug, campSlug] = slugCampMatch;
    const campus = await prisma.campus.findUnique({
      where: { slug: campusSlug },
      include: { organization: true },
    });
    if (!campus) return null;
    const camp = await prisma.camp.findFirst({
      where: { slug: campSlug, organizationId: campus.organizationId },
    });
    if (!camp) return null;
    return prisma.signupLink.findUnique({
      where: { campusId_campId: { campusId: campus.id, campId: camp.id } },
      include: { campus: { include: { organization: true } }, camp: true },
    });
  }

  // Fallback to the raw random-hex token.
  return prisma.signupLink.findUnique({
    where: { token },
    include: { campus: { include: { organization: true } }, camp: true },
  });
}
