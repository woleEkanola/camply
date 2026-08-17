import type { Prisma } from "@prisma/client";
import { syncPositionOccupantsAndDescendants, syncStaffProfileFromPositions } from "../utils/hierarchySync";
import { logEvent } from "../audit";

type TxClient = Prisma.TransactionClient;

export class PositionMergeError extends Error {
  code: string;
  constructor(message: string, code = "BAD_REQUEST") {
    super(message);
    this.name = "PositionMergeError";
    this.code = code;
  }
}

export interface MergePositionResult {
  sourceId: string;
  targetId: string;
  reassignedAssignments: number;
  demotedAssignments: number;
  promotedChildren: number;
  checklistItemsMoved: number;
  leadershipTransferred: boolean;
}

const EXCLUSIVE_ROLE_KINDS = new Set(["HEAD", "ASSISTANT_HEAD"]);

function isExclusive(position: { leadershipRole: string | null; roleKind: string }) {
  return position.leadershipRole !== null || EXCLUSIVE_ROLE_KINDS.has(position.roleKind);
}

/**
 * Absorbs `sourceId` into `targetId`: moves assignments and children onto
 * the target, transfers `leadershipRole` onto the target if only the source
 * carries one (the common "untagged JD twin merges into the real leadership
 * row" case), and soft-deletes the source. Children re-parent to the
 * TARGET (not the source's old parent) — this is a merge, not a delete.
 */
export async function mergePositionInTx(
  tx: TxClient,
  input: { sourceId: string; targetId: string; actorId: string | null }
): Promise<MergePositionResult> {
  if (input.sourceId === input.targetId) {
    throw new PositionMergeError("A role cannot be merged into itself.");
  }

  const [source, target] = await Promise.all([
    tx.position.findUnique({ where: { id: input.sourceId } }),
    tx.position.findUnique({ where: { id: input.targetId } }),
  ]);
  if (!source || source.deletedAt) throw new PositionMergeError("Source role not found.", "NOT_FOUND");
  if (!target || target.deletedAt) throw new PositionMergeError("Target role not found.", "NOT_FOUND");
  if (source.campId !== target.campId) throw new PositionMergeError("Both roles must belong to the same camp.");
  if (source.leadershipRole === "COMMANDANT") {
    throw new PositionMergeError("The Camp Commandant cannot be merged away.", "FORBIDDEN");
  }

  // Move assignments source -> target.
  const sourceAssignments = await tx.positionAssignment.findMany({ where: { positionId: source.id } });
  const affectedStaffIds = new Set(sourceAssignments.map((a) => a.staffId));
  let reassignedAssignments = 0;
  if (sourceAssignments.length) {
    reassignedAssignments = (await tx.positionAssignment.updateMany({ where: { positionId: source.id }, data: { positionId: target.id } })).count;
  }

  // If the target is an exclusive-occupancy role (a leadership seat, or
  // roleKind HEAD/ASSISTANT_HEAD), keep only the oldest current holder —
  // same tiebreak as department merge.
  let demotedAssignments = 0;
  if (isExclusive(target)) {
    const currentOnTarget = await tx.positionAssignment.findMany({
      where: { positionId: target.id, isCurrent: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    if (currentOnTarget.length > 1) {
      const [, ...extras] = currentOnTarget;
      for (const extra of extras) {
        await tx.positionAssignment.update({
          where: { id: extra.id },
          data: { isCurrent: false, endDate: new Date(), reason: `Ended by role merge — ${target.name} already had a current occupant.` },
        });
        demotedAssignments += 1;
      }
    }
  }

  // Re-parent source's children onto the TARGET.
  const children = await tx.position.findMany({ where: { parentPositionId: source.id, deletedAt: null }, select: { id: true } });
  if (children.length) {
    await tx.position.updateMany({ where: { parentPositionId: source.id, deletedAt: null }, data: { parentPositionId: target.id } });
  }

  // Move checklist items.
  const checklistItemsMoved = (await tx.departmentChecklistItem.updateMany({ where: { positionId: source.id }, data: { positionId: target.id } })).count;

  // Transfer leadershipRole onto the target if the source carried one and
  // the target doesn't — the "untagged JD twin merges into the tagged row"
  // case, and its inverse (tagging a previously-untagged target).
  let leadershipTransferred = false;
  if (source.leadershipRole && !target.leadershipRole) {
    await tx.position.update({ where: { id: target.id }, data: { leadershipRole: source.leadershipRole } });
    leadershipTransferred = true;
  }

  await tx.position.update({ where: { id: source.id }, data: { deletedAt: new Date() } });

  for (const staffId of affectedStaffIds) {
    await syncStaffProfileFromPositions(tx, staffId);
  }
  await syncPositionOccupantsAndDescendants(tx, target.id);

  await logEvent(tx, {
    organizationId: (await tx.camp.findUnique({ where: { id: target.campId }, select: { organizationId: true } }))!.organizationId,
    actorId: input.actorId,
    action: "POSITION_MERGED",
    subjectType: "POSITION",
    subjectId: target.id,
    previousValue: { sourceId: source.id, sourceName: source.name },
    newValue: { targetId: target.id, targetName: target.name, leadershipTransferred },
  });

  return {
    sourceId: source.id,
    targetId: target.id,
    reassignedAssignments,
    demotedAssignments,
    promotedChildren: children.length,
    checklistItemsMoved,
    leadershipTransferred,
  };
}
