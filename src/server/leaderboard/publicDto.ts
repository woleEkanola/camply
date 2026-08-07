import { prisma } from "../db";

/**
 * The whitelist boundary for the public leaderboard. Every field here is
 * deliberately named and typed — never spread a Prisma row into this DTO.
 * Camper names become firstName + last-initial; ScoreEvent.reason/notes
 * (free text an admin might put a name, medical note, or address into)
 * never appear anywhere in this shape. See publicDto.test.ts, which builds
 * this DTO from a fixture poisoned with phone/email/allergies/medications/
 * address/DOB/qrToken and asserts none of it survives JSON.stringify.
 */
export interface PublicLeaderboardDto {
  campName: string;
  championTribe: { name: string; color: string | null; points: number } | null;
  topTribes: { name: string; color: string | null; points: number; rank: number | null }[];
  topCampers: { displayName: string; tribeName: string | null; points: number; rank: number | null }[];
  topStaff: { displayName: string; points: number; rank: number | null }[];
  achievements: { achievementName: string; subjectDisplayName: string }[];
  feed: { text: string; points: number; occurredAt: string }[];
  lastUpdated: string | null;
}

function lastInitial(lastName: string | null | undefined): string {
  return lastName ? `${lastName.charAt(0).toUpperCase()}.` : "";
}

/** subjectKey is "T:<id>" | "C:<id>" | "S:<id>" (see AchievementAward). Fetches
 * only the display name, never a full row. */
async function resolveAchievements(
  achievements: Array<{ subjectKey: string; definition: { name: string } }>
): Promise<PublicLeaderboardDto["achievements"]> {
  const tribeIds = achievements.filter((a) => a.subjectKey.startsWith("T:")).map((a) => a.subjectKey.slice(2));
  const registrationIds = achievements.filter((a) => a.subjectKey.startsWith("C:")).map((a) => a.subjectKey.slice(2));
  const staffIds = achievements.filter((a) => a.subjectKey.startsWith("S:")).map((a) => a.subjectKey.slice(2));

  const [tribes, registrations, staff] = await Promise.all([
    prisma.tribe.findMany({ where: { id: { in: tribeIds } }, select: { id: true, name: true } }),
    prisma.registration.findMany({ where: { id: { in: registrationIds } }, select: { id: true, camper: { select: { firstName: true, lastName: true } } } }),
    prisma.staffProfile.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const tribeNameById = new Map(tribes.map((t) => [t.id, t.name]));
  const camperNameById = new Map(registrations.map((r) => [r.id, r.camper ? `${r.camper.firstName} ${lastInitial(r.camper.lastName)}`.trim() : "Camper"]));
  const staffNameById = new Map(staff.map((s) => [s.id, `${s.firstName} ${lastInitial(s.lastName)}`.trim()]));

  return achievements.map((a) => {
    const [prefix, id] = [a.subjectKey.slice(0, 2), a.subjectKey.slice(2)];
    const subjectDisplayName =
      prefix === "T:" ? (tribeNameById.get(id) ?? "A tribe") : prefix === "C:" ? (camperNameById.get(id) ?? "A camper") : (staffNameById.get(id) ?? "A staff member");
    return { achievementName: a.definition.name, subjectDisplayName };
  });
}

/** Builds the whitelist DTO for one camp. Never DB-touches anything beyond
 * what's listed in PublicLeaderboardDto's fields. */
export async function toPublicDto(campId: string, campName: string): Promise<PublicLeaderboardDto> {
  const [tribeStats, camperStats, staffStats, achievements, recentEvents, lastComputed] = await Promise.all([
    prisma.leaderboardStat.findMany({ where: { campId, subjectType: "TRIBE", day: null }, orderBy: { totalPoints: "desc" }, take: 10 }),
    prisma.leaderboardStat.findMany({ where: { campId, subjectType: "CAMPER", day: null }, orderBy: { totalPoints: "desc" }, take: 10 }),
    prisma.leaderboardStat.findMany({ where: { campId, subjectType: "STAFF", day: null }, orderBy: { totalPoints: "desc" }, take: 10 }),
    prisma.achievementAward.findMany({ where: { campId }, orderBy: { awardedAt: "desc" }, take: 10, include: { definition: true } }),
    prisma.scoreEvent.findMany({ where: { campId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.leaderboardStat.aggregate({ where: { campId }, _max: { computedAt: true } }),
  ]);

  const tribes = await prisma.tribe.findMany({ where: { id: { in: tribeStats.map((s) => s.subjectId) } }, select: { id: true, name: true, color: true } });
  const tribeById = new Map(tribes.map((t) => [t.id, t]));

  const registrations = await prisma.registration.findMany({
    where: { id: { in: camperStats.map((s) => s.subjectId) } },
    select: { id: true, tribeId: true, camper: { select: { firstName: true, lastName: true } } },
  });
  const registrationById = new Map(registrations.map((r) => [r.id, r]));

  const staffProfiles = await prisma.staffProfile.findMany({
    where: { id: { in: staffStats.map((s) => s.subjectId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const staffById = new Map(staffProfiles.map((s) => [s.id, s]));

  // Category names for the feed — the feed text is generated server-side
  // from a fixed template, never from ScoreEvent.reason/notes.
  const categoryIds = [...new Set(recentEvents.map((e) => e.categoryId))];
  const categories = await prisma.scoreCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } });
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const feed = recentEvents.map((e) => {
    let subjectDisplayName = "Someone";
    if (e.tribeId) subjectDisplayName = tribeById.get(e.tribeId)?.name ?? "A tribe";
    else if (e.registrationId) {
      const reg = registrationById.get(e.registrationId);
      subjectDisplayName = reg?.camper ? `${reg.camper.firstName} ${lastInitial(reg.camper.lastName)}`.trim() : "A camper";
    } else if (e.staffProfileId) {
      const staff = staffById.get(e.staffProfileId);
      subjectDisplayName = staff ? `${staff.firstName} ${lastInitial(staff.lastName)}`.trim() : "A staff member";
    }
    const categoryName = categoryNameById.get(e.categoryId) ?? "points";
    const verb = e.points >= 0 ? "earned" : "lost";
    return {
      text: `${subjectDisplayName} ${verb} ${Math.abs(e.points)} pts for ${categoryName}`,
      points: e.points,
      occurredAt: e.occurredAt.toISOString(),
    };
  });

  const topTribes = tribeStats.map((s) => ({
    name: tribeById.get(s.subjectId)?.name ?? "Tribe",
    color: tribeById.get(s.subjectId)?.color ?? null,
    points: s.totalPoints,
    rank: s.rank,
  }));

  return {
    campName,
    championTribe: topTribes[0] ?? null,
    topTribes,
    topCampers: camperStats.map((s) => {
      const reg = registrationById.get(s.subjectId);
      return {
        displayName: reg?.camper ? `${reg.camper.firstName} ${lastInitial(reg.camper.lastName)}`.trim() : "Camper",
        tribeName: reg?.tribeId ? (tribeById.get(reg.tribeId)?.name ?? null) : null,
        points: s.totalPoints,
        rank: s.rank,
      };
    }),
    topStaff: staffStats.map((s) => {
      const staff = staffById.get(s.subjectId);
      return {
        displayName: staff ? `${staff.firstName} ${lastInitial(staff.lastName)}`.trim() : "Staff",
        points: s.totalPoints,
        rank: s.rank,
      };
    }),
    achievements: await resolveAchievements(achievements),
    feed,
    lastUpdated: lastComputed._max.computedAt?.toISOString() ?? null,
  };
}

/**
 * The whitelist boundary for `/l/[token]/announce` — deliberately its own
 * DTO with its own PII test (see publicAnnouncement.test.ts), the same
 * discipline as `PublicLeaderboardDto`, because it's the same trust
 * boundary (unauthenticated, token-only). Built by transforming
 * `toPublicDto`'s already-whitelisted output rather than re-querying
 * Prisma directly — every field here traces back through the one
 * PII-reviewed funnel, not a second hand-written query surface.
 */
export interface PublicAnnouncementDto {
  campName: string;
  items: { id: string; icon: string; text: string }[];
}

export async function toPublicAnnouncementDto(campId: string, campName: string): Promise<PublicAnnouncementDto> {
  const dto = await toPublicDto(campId, campName);
  const items: PublicAnnouncementDto["items"] = [];

  if (dto.championTribe) {
    items.push({ id: "champion", icon: "🏆", text: `${dto.championTribe.name} leads with ${dto.championTribe.points} pts!` });
  }
  for (const [i, a] of dto.achievements.entries()) {
    items.push({ id: `ach-${i}`, icon: "🎖️", text: `${a.subjectDisplayName} earned ${a.achievementName}!` });
  }
  for (const [i, f] of dto.feed.slice(0, 10).entries()) {
    items.push({ id: `feed-${i}`, icon: f.points >= 0 ? "✨" : "⚠️", text: f.text });
  }

  return { campName: dto.campName, items };
}
