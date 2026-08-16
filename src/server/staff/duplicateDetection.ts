import type { Prisma, PrismaClient, StaffStatus, StaffType } from "@prisma/client";
import { toWhatsAppDigits } from "../../lib/phone";
import { stringSimilarity } from "../utils/stringSimilarity";

type TxClient = PrismaClient<any> | Prisma.TransactionClient;

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "pst", "pastor", "bro", "sis", "rev", "evang", "deacon", "deaconess", "prof", "engr", "elder"]);

/**
 * Last-10-digits phone key. Makes "08012345678", "+2348012345678",
 * "2348012345678", and hyphenated/spaced variants of the same number all
 * compare equal, without assuming every number is Nigerian (unlike
 * `normalizeNigerianPhone`, which the registration route never actually
 * calls — phone is stored freeform). Returns null for anything too short to
 * be a real phone number, so two blank/garbage phones never "match".
 */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = toWhatsAppDigits(raw);
  if (!digits || digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Lowercase, diacritic- and punctuation-stripped, honorific-stripped,
 * token-sorted name key. Token-sorting means swapped first/last names
 * ("Adeyemi John" vs "John Adeyemi") compare equal for free.
 */
export function normalizeStaffName(firstName: string, lastName: string): string {
  const raw = `${firstName ?? ""} ${lastName ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !HONORIFICS.has(token));
  return raw.sort().join(" ").trim();
}

/**
 * Similarity in [0,1] between two already-normalized name keys. Extends the
 * shared `stringSimilarity` (token overlap / edit distance) with an
 * initials check, so "j adeyemi" scores meaningfully against
 * "john adeyemi" even though neither token-overlap nor edit-distance alone
 * would see them as close.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const base = stringSimilarity(a, b);
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  if (tokensA.length && tokensB.length) {
    const initialsA = tokensA.map((t) => t[0]).sort().join("");
    const initialsB = tokensB.map((t) => t[0]).sort().join("");
    // Only treat matching initials as signal when the token-count differs —
    // otherwise two different same-length names sharing initials (rare, but
    // possible) would get boosted for no good reason.
    if (initialsA === initialsB && tokensA.length !== tokensB.length) {
      return Math.max(base, 0.6);
    }
  }
  return base;
}

export type DuplicateConfidence = "CERTAIN" | "HIGH" | "MEDIUM" | "LOW";
export type DuplicateSignal = "SAME_USER_OR_EMAIL" | "SAME_PHONE" | "SIMILAR_NAME";

export interface DuplicateDetectionMember {
  id: string;
  userId: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  preferredCampusId: string | null;
  status: StaffStatus;
  type: StaffType;
  createdAt: Date;
}

export interface DuplicatePairSignal {
  signal: DuplicateSignal;
  confidence: DuplicateConfidence;
}

export interface DuplicateGroup<T extends DuplicateDetectionMember = DuplicateDetectionMember> {
  key: string;
  members: T[];
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  integrityAlarm: boolean;
  suggestedTargetId: string;
}

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CERTAIN: 3 };

function pairSignals(a: DuplicateDetectionMember, b: DuplicateDetectionMember): DuplicatePairSignal[] {
  const signals: DuplicatePairSignal[] = [];

  // Integrity alarm: two live profiles that are, by construction, supposed
  // to be impossible — same login account, or the exact same email. Always
  // on regardless of the two signals the product owner actually asked for,
  // since this specifically means the protective unique index is either
  // missing or was bypassed.
  if (a.userId === b.userId || a.email.toLowerCase() === b.email.toLowerCase()) {
    signals.push({ signal: "SAME_USER_OR_EMAIL", confidence: "CERTAIN" });
  }

  const phoneA = normalizePhoneKey(a.phone);
  const phoneB = normalizePhoneKey(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    signals.push({ signal: "SAME_PHONE", confidence: "HIGH" });
  }

  const nameA = normalizeStaffName(a.firstName, a.lastName);
  const nameB = normalizeStaffName(b.firstName, b.lastName);
  const sameCampus = Boolean(a.preferredCampusId) && a.preferredCampusId === b.preferredCampusId;
  const similarity = nameSimilarity(nameA, nameB);
  if (similarity > 0) {
    let confidence: DuplicateConfidence | null = null;
    if (sameCampus) {
      if (similarity >= 0.85) confidence = "HIGH";
      else if (similarity >= 0.7) confidence = "MEDIUM";
      else if (similarity >= 0.55) confidence = "LOW";
    } else if (!a.preferredCampusId && !b.preferredCampusId) {
      // Neither side has established a campus — "same campus" genuinely
      // isn't known, so require a tighter name match and cap one tier lower.
      if (similarity >= 0.92) confidence = "MEDIUM";
      else if (similarity >= 0.8) confidence = "LOW";
    }
    if (confidence) signals.push({ signal: "SIMILAR_NAME", confidence });
  }

  return signals;
}

interface UnionFind {
  parent: Map<string, string>;
  find(id: string): string;
  union(a: string, b: string): void;
}

function createUnionFind(ids: string[]): UnionFind {
  const parent = new Map(ids.map((id) => [id, id]));
  const uf: UnionFind = {
    parent,
    find(id) {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let cur = id;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    },
    union(a, b) {
      const rootA = uf.find(a);
      const rootB = uf.find(b);
      if (rootA !== rootB) parent.set(rootA, rootB);
    },
  };
  return uf;
}

function pickSuggestedTarget(members: DuplicateDetectionMember[]): string {
  const approved = members.filter((m) => m.status === "APPROVED");
  const pool = approved.length ? approved : members;
  return pool.reduce((oldest, m) => (m.createdAt < oldest.createdAt ? m : oldest), pool[0]!).id;
}

/**
 * Pure grouping logic — no Prisma dependency, fully unit-testable. Groups a
 * flat list of staff profiles (already scoped to one camp) into duplicate
 * clusters via union-find over any pairwise signal, so a chain of matches
 * (A~B, B~C) merges into one group even if A and C don't directly match.
 */
export function detectDuplicateGroups<T extends DuplicateDetectionMember>(members: T[]): DuplicateGroup<T>[] {
  const uf = createUnionFind(members.map((m) => m.id));
  const pairSignalsByRoot = new Map<string, Map<DuplicateSignal, DuplicateConfidence>>();

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i]!;
      const b = members[j]!;
      const signals = pairSignals(a, b);
      if (signals.length === 0) continue;
      uf.union(a.id, b.id);
    }
  }

  // Re-walk pairs once roots are settled, accumulating every signal that
  // fired anywhere within the final group (not just the pair that first
  // triggered the union), so a group's confidence reflects its strongest
  // evidence overall.
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i]!;
      const b = members[j]!;
      const root = uf.find(a.id);
      if (root !== uf.find(b.id)) continue;
      const signals = pairSignals(a, b);
      if (signals.length === 0) continue;
      const bucket = pairSignalsByRoot.get(root) ?? new Map<DuplicateSignal, DuplicateConfidence>();
      for (const s of signals) {
        const existing = bucket.get(s.signal);
        if (!existing || CONFIDENCE_RANK[s.confidence] > CONFIDENCE_RANK[existing]) {
          bucket.set(s.signal, s.confidence);
        }
      }
      pairSignalsByRoot.set(root, bucket);
    }
  }

  const groupsByRoot = new Map<string, T[]>();
  for (const m of members) {
    const root = uf.find(m.id);
    const arr = groupsByRoot.get(root) ?? [];
    arr.push(m);
    groupsByRoot.set(root, arr);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const [root, groupMembers] of groupsByRoot) {
    if (groupMembers.length < 2) continue;
    const bucket = pairSignalsByRoot.get(root) ?? new Map<DuplicateSignal, DuplicateConfidence>();
    const signals = Array.from(bucket.keys());
    const confidence = signals.reduce<DuplicateConfidence>(
      (best, s) => (CONFIDENCE_RANK[bucket.get(s)!] > CONFIDENCE_RANK[best] ? bucket.get(s)! : best),
      "LOW"
    );
    groups.push({
      key: root,
      members: groupMembers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      confidence,
      signals,
      integrityAlarm: signals.includes("SAME_USER_OR_EMAIL"),
      suggestedTargetId: pickSuggestedTarget(groupMembers),
    });
  }

  return groups.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
}

export interface IndexHealth {
  staffProfileUniqueIndexPresent: boolean;
}

/** Whether the `StaffProfile_userId_campId_key` partial unique index (the race backstop for /api/staff/register) exists on this database. */
export async function probeIndexHealth(tx: TxClient): Promise<IndexHealth> {
  const rows = await tx.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'StaffProfile' AND indexname = 'StaffProfile_userId_campId_key'
  `;
  return { staffProfileUniqueIndexPresent: rows.length > 0 };
}

export interface EnrichedDuplicateMember extends DuplicateDetectionMember {
  preferredName: string | null;
  campusName: string | null;
  departmentName: string | null;
  hasQrToken: boolean;
  points: number;
}

export interface EnrichedDuplicateGroup {
  key: string;
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  integrityAlarm: boolean;
  suggestedTargetId: string;
  members: EnrichedDuplicateMember[];
}

export interface DuplicateReport {
  indexHealth: IndexHealth;
  groups: EnrichedDuplicateGroup[];
}

/**
 * Fetches all live staff profiles for a camp (optionally filtered by type),
 * runs detection, and enriches each member with the display fields the UI
 * and the STAFF_DUPLICATES export both need (campus/department names,
 * points). Both `staff.duplicateReport` (the tRPC query) and the export
 * builder call this one function so the on-screen report and the exported
 * spreadsheet can never drift apart.
 */
export async function buildDuplicateReport(
  tx: TxClient,
  params: { organizationId: string; campId: string; type?: StaffType }
): Promise<DuplicateReport> {
  const [indexHealth, rows] = await Promise.all([
    probeIndexHealth(tx),
    tx.staffProfile.findMany({
      where: { organizationId: params.organizationId, campId: params.campId, deletedAt: null, ...(params.type ? { type: params.type } : {}) },
      select: {
        id: true,
        userId: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        preferredCampusId: true,
        preferredCampus: { select: { name: true } },
        departmentId: true,
        department: { select: { name: true } },
        status: true,
        type: true,
        createdAt: true,
        qrToken: true,
      },
    }),
  ]);

  const groups = detectDuplicateGroups(rows);
  const staffIds = groups.flatMap((g) => g.members.map((m) => m.id));
  const stats = staffIds.length
    ? await tx.leaderboardStat.findMany({
        where: { campId: params.campId, subjectType: "STAFF", subjectId: { in: staffIds }, day: null },
        select: { subjectId: true, totalPoints: true },
      })
    : [];
  const pointsById = new Map(stats.map((s: { subjectId: string; totalPoints: number }) => [s.subjectId, s.totalPoints]));

  return {
    indexHealth,
    groups: groups.map((g) => ({
      key: g.key,
      confidence: g.confidence,
      signals: g.signals,
      integrityAlarm: g.integrityAlarm,
      suggestedTargetId: g.suggestedTargetId,
      members: g.members.map((m) => ({
        ...m,
        preferredName: m.preferredName,
        campusName: m.preferredCampus?.name ?? null,
        departmentName: m.department?.name ?? null,
        hasQrToken: Boolean(m.qrToken),
        points: pointsById.get(m.id) ?? 0,
      })),
    })),
  };
}
