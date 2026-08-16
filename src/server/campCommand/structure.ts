import type { CampCommandPolicy, Department, Position, Prisma } from "@prisma/client";
import { logEvent } from "../audit";
import { syncStaffProfileFromPositions } from "../utils/hierarchySync";

type TxClient = Prisma.TransactionClient;

const norm = (s: string) => s.trim().toLowerCase();

export interface EnsureCampCommandStructureResult {
  department: Department;
  commandantPosition: Position;
  assistantPosition: Position;
  assistantPositions: Position[];
  policy: CampCommandPolicy | null;
  adopted: { id: string; name: string; role: "COMMANDANT" | "ASSISTANT_COMMANDANT" }[];
  splits: number;
  ambiguous: { id: string; name: string }[];
}

export interface EnsureCampCommandStructureOptions {
  /**
   * Re-parents every pre-existing top-level, non-leadership position under
   * the Commandant. O(camp) and it silently undoes any deliberate
   * drag-to-root an admin performed in the organogram, so it must only run
   * from an explicit "set up / repair structure" entry point — never from
   * `campCommand.appoint`, which calls this on every single appointment.
   */
  reparentOrphans?: boolean;
  actorId?: string | null;
}

/**
 * Idempotent Camp Command structure reconcile. Root-cause fix for the
 * duplicate Commandant/Assistant bug: the previous version
 * (campCommand.ts's old private `ensureStructure`) looked for existing rows
 * by `leadershipRole` ONLY, while `seedTeenCampDepartments` (jdSeed.ts,
 * "Install 2026 JD") creates positions named "Camp Commandant" /
 * "Deputy Camp Commandant (…)" matched by NAME with `leadershipRole` left
 * NULL. Neither could see the other's rows, so each made its own copy, and
 * `campCommand.appoint` re-ran this on every appointment, compounding it.
 *
 * This version adopts a same-named untagged row instead of creating a
 * second one, and additionally splits the legacy "one shared Assistant
 * Commandant position with many assignments" shape into distinct positions
 * (one per holder) so assistants can be independently named, moved, and
 * deleted going forward.
 */
export async function ensureCampCommandStructure(
  tx: TxClient,
  campId: string,
  organizationId: string,
  opts: EnsureCampCommandStructureOptions = {}
): Promise<EnsureCampCommandStructureResult> {
  const adopted: EnsureCampCommandStructureResult["adopted"] = [];
  const ambiguous: EnsureCampCommandStructureResult["ambiguous"] = [];

  let department = await tx.department.findFirst({
    where: { campId, systemKey: "CAMP_COMMAND", deletedAt: null },
  });
  if (!department) {
    department = await tx.department.create({
      data: {
        organizationId,
        campId,
        systemKey: "CAMP_COMMAND",
        name: "Camp Command",
        description: "Camp Commandant and Assistant Camp Commandants",
        responsibilities: ["Overall camp leadership", "Coordination of departments", "Camp operations oversight"],
      },
    });
  }

  // Untagged rows in the Camp Command department (or with no department at
  // all, for pre-JD data) that COULD be a leadership row someone already
  // created by name — the pool ensureStructure's old leadershipRole-only
  // lookup was blind to.
  const untaggedCandidates = await tx.position.findMany({
    where: {
      campId,
      leadershipRole: null,
      deletedAt: null,
      OR: [{ departmentId: department.id }, { departmentId: null }],
    },
    orderBy: { createdAt: "asc" },
  });

  // ─── Commandant ──────────────────────────────────────────────────────
  const taggedCommandants = await tx.position.findMany({
    where: { campId, leadershipRole: "COMMANDANT", deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  let commandantPosition = taggedCommandants[0] ?? null;
  for (const extra of taggedCommandants.slice(1)) {
    ambiguous.push({ id: extra.id, name: extra.name });
  }

  if (!commandantPosition) {
    const twin = untaggedCandidates.find((p) => norm(p.name) === "camp commandant");
    if (twin) {
      commandantPosition = await tx.position.update({
        where: { id: twin.id },
        data: { leadershipRole: "COMMANDANT", departmentId: department.id, displayOrder: -100, parentPositionId: null },
      });
      adopted.push({ id: commandantPosition.id, name: commandantPosition.name, role: "COMMANDANT" });
    } else {
      commandantPosition = await tx.position.create({
        data: {
          campId,
          departmentId: department.id,
          name: "Camp Commandant",
          leadershipRole: "COMMANDANT",
          displayOrder: -100,
        },
      });
    }
  }

  // ─── Assistants ──────────────────────────────────────────────────────
  const taggedAssistants = await tx.position.findMany({
    where: { campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  const taggedAssistantNames = new Set(taggedAssistants.map((p) => norm(p.name)));

  // Adopt exact-name untagged twins — but only when no tagged row already
  // holds that name, otherwise this is an ambiguous pair for the user to
  // resolve via "Merge into…" rather than something safe to auto-adopt.
  for (const candidate of untaggedCandidates) {
    if (candidate.id === commandantPosition.id) continue;
    const isAssistantTwin = norm(candidate.name) === "assistant camp commandant";
    if (!isAssistantTwin) continue;
    if (taggedAssistantNames.has(norm(candidate.name))) {
      ambiguous.push({ id: candidate.id, name: candidate.name });
      continue;
    }
    const updated = await tx.position.update({
      where: { id: candidate.id },
      data: { leadershipRole: "ASSISTANT_COMMANDANT", departmentId: department.id, parentPositionId: commandantPosition.id },
    });
    taggedAssistants.push(updated);
    taggedAssistantNames.add(norm(updated.name));
    adopted.push({ id: updated.id, name: updated.name, role: "ASSISTANT_COMMANDANT" });
  }
  // Note: "Deputy Camp Commandant (…)" JD units are deliberately NOT
  // name-matched or auto-adopted here — they don't match "assistant camp
  // commandant" and tests/departments-operations.spec.ts:98 asserts that
  // exact string stays visible. They surface via position.duplicateGroups
  // as user-driven merge candidates instead.

  let assistantPositions = taggedAssistants;
  if (assistantPositions.length === 0) {
    const created = await tx.position.create({
      data: {
        campId,
        departmentId: department.id,
        parentPositionId: commandantPosition.id,
        name: "Assistant Camp Commandant",
        leadershipRole: "ASSISTANT_COMMANDANT",
        displayOrder: -90,
      },
    });
    assistantPositions = [created];
  }

  // ─── Split a legacy shared assistant row (>1 current holder) into one
  // position per holder, so assistants become individually nameable/movable
  // going forward. Keep the oldest holder on the original row.
  let splits = 0;
  let nextDisplayOrder = -90 + assistantPositions.length;
  for (const position of [...assistantPositions]) {
    const currentHolders = await tx.positionAssignment.findMany({
      where: { positionId: position.id, isCurrent: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    if (currentHolders.length <= 1) continue;
    const [, ...extras] = currentHolders;
    let copyNumber = 2;
    for (const extra of extras) {
      const splitPosition = await tx.position.create({
        data: {
          campId,
          departmentId: department.id,
          parentPositionId: commandantPosition.id,
          name: `${position.name} ${copyNumber}`,
          leadershipRole: "ASSISTANT_COMMANDANT",
          displayOrder: nextDisplayOrder,
        },
      });
      copyNumber += 1;
      nextDisplayOrder += 1;
      await tx.positionAssignment.update({ where: { id: extra.id }, data: { positionId: splitPosition.id } });
      await syncStaffProfileFromPositions(tx, extra.staffId);
      assistantPositions.push(splitPosition);
      splits += 1;
      await logEvent(tx, {
        organizationId,
        actorId: opts.actorId ?? null,
        action: "CAMP_COMMAND_ASSISTANT_SPLIT",
        subjectType: "POSITION",
        subjectId: splitPosition.id,
        previousValue: { sharedPositionId: position.id, sharedPositionName: position.name },
        newValue: { splitPositionId: splitPosition.id, staffId: extra.staffId },
      });
    }
  }

  // ─── Orphan reparenting (opt-in, expensive) ─────────────────────────
  if (opts.reparentOrphans) {
    const leadershipIds = [commandantPosition.id, ...assistantPositions.map((p) => p.id)];
    await tx.position.updateMany({
      where: {
        campId,
        id: { notIn: leadershipIds },
        parentPositionId: null,
        leadershipRole: null,
        deletedAt: null,
      },
      data: { parentPositionId: commandantPosition.id },
    });
  }

  const policy = opts.reparentOrphans
    ? await tx.campCommandPolicy.upsert({ where: { campId }, create: { campId }, update: {} })
    : await tx.campCommandPolicy.findUnique({ where: { campId } });

  return {
    department,
    commandantPosition,
    assistantPosition: assistantPositions[0],
    assistantPositions,
    policy: policy ?? null,
    adopted,
    splits,
    ambiguous,
  };
}
