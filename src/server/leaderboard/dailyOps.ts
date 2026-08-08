import { prisma } from "../db";
import { campDayKey } from "./dayKey";
import { notifyTeacherOfTheDay } from "./notify";

/**
 * Computed in the nightly reconcile cron only (never on a read path, never
 * on every rebuild) — the top STAFF LeaderboardStat day row for "today" (the
 * camp's own timezone, matching how every other day-keyed computation in
 * this feature works). Deduped via an AuditLog existence check rather than
 * a schema change: `subjectId` here is a fabricated `<campId>#<dayKey>`
 * composite key, not a real entity id — a deliberate, self-contained dedupe
 * key rather than a new table, per the plan this implements.
 */
export async function awardTeacherOfTheDay(campId: string, timezone = "Africa/Lagos"): Promise<{ staffProfileId: string; staffName: string } | null> {
  const dayKey = campDayKey(new Date(), timezone);
  const dedupeKey = `${campId}#${dayKey}`;

  const existing = await prisma.auditLog.findFirst({
    where: { action: "LEADERBOARD_TEACHER_OF_THE_DAY", subjectId: dedupeKey },
  });
  if (existing) return null;

  const dayDate = new Date(`${dayKey}T00:00:00.000Z`);
  const top = await prisma.leaderboardStat.findFirst({
    where: { campId, subjectType: "STAFF", day: dayDate, totalPoints: { gt: 0 } },
    orderBy: { totalPoints: "desc" },
  });
  if (!top) return null;

  const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { organizationId: true } });
  const staff = await prisma.staffProfile.findUnique({ where: { id: top.subjectId }, select: { firstName: true, lastName: true } });
  if (!camp || !staff) return null;

  // Written before notifying — if the notification fails (caught and
  // logged inside notifyTeacherOfTheDay, never thrown), the dedupe record
  // still exists, so a second cron run on the same day won't re-fire.
  await prisma.auditLog.create({
    data: {
      organizationId: camp.organizationId,
      action: "LEADERBOARD_TEACHER_OF_THE_DAY",
      subjectType: "STAFF",
      subjectId: dedupeKey,
      newValue: { staffProfileId: top.subjectId, day: dayKey, totalPoints: top.totalPoints },
    },
  });

  // The spec calls Teacher of the Day a *persisted award*, and the seeded
  // "Top Teacher" definition (seed-ach-top-teacher) exists precisely for it —
  // before this, the only trace was the AuditLog dedupe row above and a
  // transient notification, so nothing ever showed up on the Achievements tab
  // or the staff detail page. Deduped for free by AchievementAward's existing
  // @@unique([definitionId, subjectKey]), so a teacher who wins on multiple
  // days keeps one award (matching every other achievement's semantics)
  // rather than accumulating duplicates.
  const definition = await prisma.achievementDefinition.findFirst({
    where: { key: "TOP_TEACHER", OR: [{ campId }, { campId: null }] },
  });
  if (definition) {
    try {
      await prisma.achievementAward.create({
        data: { definitionId: definition.id, campId, subjectKey: `S:${top.subjectId}` },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }

  const staffName = `${staff.firstName} ${staff.lastName}`;
  await notifyTeacherOfTheDay(campId, top.subjectId, staffName, top.totalPoints);
  return { staffProfileId: top.subjectId, staffName };
}
