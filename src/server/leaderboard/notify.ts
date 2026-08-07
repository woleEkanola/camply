import { prisma } from "../db";

/**
 * Mirrors registration/effects.ts's resilience pattern: logs and swallows,
 * never blocks the caller (rebuildRanks / achievement.award). Two of the
 * plan's four triggers are implemented — tribe enters Top 3, and any
 * achievement award. "Teacher of the Day" (needs a daily-window
 * computation nothing in this codebase does yet) and an automatic
 * "reaches Perfect Attendance" trigger (that achievement can already be
 * awarded manually via achievement.award, which does notify) are
 * deliberately not built — see backlog.md. The "Announcement screen"
 * channel from the plan is also not built; only IN_APP exists today.
 */

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"] as const;

async function notifyOrgAdmins(organizationId: string, title: string, body: string, link?: string) {
  const admins = await prisma.user.findMany({ where: { organizationId, role: { in: [...ADMIN_ROLES] } }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ organizationId, userId: a.id, title, body, link, channel: "IN_APP" })),
  });
}

async function notifyTribeParents(campId: string, tribeId: string, organizationId: string, title: string, body: string, link?: string) {
  const registrations = await prisma.registration.findMany({
    where: { campId, tribeId, deletedAt: null },
    select: { camper: { select: { userId: true } } },
  });
  const parentIds = [...new Set(registrations.map((r) => r.camper?.userId).filter((id): id is string => !!id))];
  if (parentIds.length === 0) return;
  await prisma.notification.createMany({
    data: parentIds.map((userId) => ({ organizationId, userId, title, body, link, channel: "IN_APP" })),
  });
}

/** Called after rebuildRanks — deduped by only firing when a tribe's rank
 * transitions from outside the top 3 into it (never on every rebuild). */
export async function notifyTribeEnteredTopThree(campId: string, tribeId: string, tribeName: string, newRank: number, previousRank: number | null) {
  if (newRank > 3) return;
  if (previousRank != null && previousRank <= 3) return; // already was top 3, not a transition
  try {
    const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { organizationId: true } });
    if (!camp) return;
    const title = `${tribeName} entered the Top 3!`;
    const body = `${tribeName} is now ranked #${newRank} on the leaderboard.`;
    const link = "/leaderboard";
    await Promise.all([
      notifyOrgAdmins(camp.organizationId, title, body, link),
      notifyTribeParents(campId, tribeId, camp.organizationId, title, body, link),
    ]);
  } catch (error) {
    console.error("[notify] notifyTribeEnteredTopThree failed:", error);
  }
}

export async function notifyAchievementAwarded(campId: string, achievementName: string, subjectType: "TRIBE" | "CAMPER" | "STAFF", subjectId: string) {
  try {
    const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { organizationId: true } });
    if (!camp) return;
    const title = `Achievement unlocked: ${achievementName}`;
    let body = `A new achievement was awarded.`;
    let recipientUserIds: string[] = [];

    if (subjectType === "CAMPER") {
      const reg = await prisma.registration.findUnique({ where: { id: subjectId }, select: { camper: { select: { userId: true, name: true } } } });
      if (reg?.camper) {
        body = `${reg.camper.name} earned "${achievementName}"!`;
        if (reg.camper.userId) recipientUserIds.push(reg.camper.userId);
      }
    } else if (subjectType === "TRIBE") {
      const tribe = await prisma.tribe.findUnique({ where: { id: subjectId }, select: { name: true } });
      body = `${tribe?.name ?? "A tribe"} earned "${achievementName}"!`;
    } else if (subjectType === "STAFF") {
      const staff = await prisma.staffProfile.findUnique({ where: { id: subjectId }, select: { firstName: true, lastName: true, userId: true } });
      body = `${staff ? `${staff.firstName} ${staff.lastName}` : "A staff member"} earned "${achievementName}"!`;
      if (staff?.userId) recipientUserIds.push(staff.userId);
    }

    const link = "/leaderboard";
    await Promise.all([
      notifyOrgAdmins(camp.organizationId, title, body, link),
      recipientUserIds.length > 0
        ? prisma.notification.createMany({ data: recipientUserIds.map((userId) => ({ organizationId: camp.organizationId, userId, title, body, link, channel: "IN_APP" })) })
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("[notify] notifyAchievementAwarded failed:", error);
  }
}
