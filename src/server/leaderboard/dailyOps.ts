import { prisma } from "../db";
import { campDayKey } from "./dayKey";
import { notifyTeacherOfTheDay } from "./notify";
import { recordScoreEvent } from "./record";
import { completeRegistration } from "../registration/engine";

export const CAMP_COMPLETION_CATEGORY_ID = "seed-cat-camp-completion";

export type CompletionMode = "CHECKOUT" | "CAMP_END" | "MANUAL";

/**
 * Awards the spec's "camp completion" points — the one automatic scoring
 * trigger that was never implemented.
 *
 * Three modes, per camp (`LeaderboardSettings.completionMode`, default
 * MANUAL so nothing fires until an admin opts in):
 *  - `CHECKOUT`  — anyone who has actually checked out
 *                  (`Registration.checkedOutAt`, the field the checkout scan
 *                  already writes).
 *  - `CAMP_END`  — everyone still active once `Camp.endDate` has passed,
 *                  swept by the nightly reconcile. Credits people who left
 *                  without a checkout scan; that's the trade-off of the mode.
 *  - `MANUAL`    — nothing automatic; an admin presses "Award Camp
 *                  Completion" to round everyone up at once.
 *
 * `force` is what the manual admin action passes, so it can award regardless
 * of the configured mode. Every award goes through `recordScoreEvent` with a
 * stable `completion:*` idempotencyKey, so the modes are mutually safe, the
 * nightly sweep is re-runnable, and a subject can never be double-credited
 * even if the mode changes mid-camp.
 *
 * Also transitions each **CHECKED_IN** registration to `COMPLETED`, via the
 * registration engine's `completeRegistration` — scoring never writes
 * `Registration.status` itself. That set is narrower than the points sweep
 * (see the comment at the transition loop), and the difference is reported
 * back rather than hidden.
 *
 * Note on CHECKOUT mode: completion lands on the next nightly reconcile, not
 * instantly at the checkout desk. `scan.ts`'s checkout branch is deliberately
 * untouched — it is the most latency-sensitive path in the app, is
 * at-most-once by design, and is duplicated in an offline-sync branch that
 * would have to be kept in step.
 */
export async function awardCampCompletion(
  campId: string,
  opts: { force?: boolean; actorId?: string } = {}
): Promise<{ campers: number; staff: number; completed: number; notCheckedIn: number; skipped: "MODE" | null }> {
  const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { endDate: true } });
  if (!camp) return { campers: 0, staff: 0, completed: 0, notCheckedIn: 0, skipped: null };

  const settings = await prisma.leaderboardSettings.findUnique({ where: { campId } });
  const mode = ((settings as any)?.completionMode ?? "MANUAL") as CompletionMode;
  const points = (settings as any)?.completionPoints ?? 50;

  if (!opts.force) {
    if (mode === "MANUAL") return { campers: 0, staff: 0, completed: 0, notCheckedIn: 0, skipped: "MODE" };
    if (mode === "CAMP_END" && camp.endDate > new Date()) return { campers: 0, staff: 0, completed: 0, notCheckedIn: 0, skipped: "MODE" };
  }

  // CHECKOUT mode only credits registrations that actually checked out;
  // the other two modes sweep everyone who reached the camp.
  const requireCheckout = !opts.force && mode === "CHECKOUT";
  const registrations = await prisma.registration.findMany({
    where: {
      campId,
      deletedAt: null,
      status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] },
      ...(requireCheckout ? { checkedOutAt: { not: null } } : {}),
    },
    select: { id: true, tribeId: true, campusId: true, status: true },
  });

  let campers = 0;
  for (const reg of registrations) {
    const event = await recordScoreEvent({
      campId,
      registrationId: reg.id,
      tribeId: reg.tribeId,
      campusId: reg.campusId,
      categoryId: CAMP_COMPLETION_CATEGORY_ID,
      points,
      reason: "Camp completion",
      source: "SYSTEM",
      idempotencyKey: `completion:${reg.id}`,
    });
    if (event) campers++;
  }

  const staffProfiles = await prisma.staffProfile.findMany({
    where: { campId, deletedAt: null, status: "APPROVED" },
    select: { id: true, assignedTribeId: true },
  });

  let staff = 0;
  for (const s of staffProfiles) {
    const event = await recordScoreEvent({
      campId,
      staffProfileId: s.id,
      categoryId: CAMP_COMPLETION_CATEGORY_ID,
      points,
      reason: "Camp completion",
      source: "SYSTEM",
      idempotencyKey: `completion:staff:${s.id}`,
    });
    if (event) staff++;
  }

  // Status transition, through the registration engine's own choke point —
  // scoring never writes Registration.status directly.
  //
  // This covers a NARROWER set than the points sweep above: CHECKED_IN is the
  // only status the state machine allows to reach COMPLETED, so an APPROVED
  // camper who never checked in earns completion points but keeps their
  // status. That asymmetry is intentional (you cannot complete a camp you were
  // never checked into) and is reported back rather than hidden, so the admin
  // toast can say what actually moved.
  let completed = 0;
  let notCheckedIn = 0;
  for (const reg of registrations) {
    if (reg.status !== "CHECKED_IN") {
      if (reg.status !== "COMPLETED") notCheckedIn++;
      continue;
    }
    try {
      await completeRegistration({ registrationId: reg.id, actorId: opts.actorId });
      completed++;
    } catch (error) {
      // Never let one registration abort the sweep — the nightly reconcile
      // runs unattended, and a single bad row must not stop every other camp.
      console.error(`[dailyOps] completeRegistration failed for ${reg.id}:`, error);
    }
  }

  return { campers, staff, completed, notCheckedIn, skipped: null };
}

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
