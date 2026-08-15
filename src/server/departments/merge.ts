import type { Prisma } from "@prisma/client";
import { syncStaffProfileFromPositions } from "../utils/hierarchySync";
import { logEvent } from "../audit";

type TxClient = Prisma.TransactionClient;

export class DepartmentMergeError extends Error {
  code: string;
  constructor(message: string, code = "BAD_REQUEST") {
    super(message);
    this.name = "DepartmentMergeError";
    this.code = code;
  }
}

export interface MergeDepartmentResult {
  sourceId: string;
  targetId: string;
  movedPositions: number;
  collapsedPositions: number;
  reassignedAssignments: number;
  demotedAssignments: number;
  movedStaffCount: number;
  childDepartmentsMoved: number;
  checklistItemsMoved: number;
  announcementsMoved: number;
  documentsMoved: number;
  capacityOverflow: boolean;
}

const EXCLUSIVE_ROLE_KINDS = new Set(["HEAD", "ASSISTANT_HEAD"]);

/**
 * Non-lossy department merge: moves everything the simpler `department.merge`
 * mutation used to abandon (checklist items, announcements, documents, child
 * departments), collapses positions that collide by name instead of creating
 * duplicate heads, and leaves the source soft-deleted (Trash-recoverable)
 * with `mergedIntoId` set rather than parked in the orphan `ARCHIVED` state.
 *
 * `StaffProfile.preferredDepartmentId` is deliberately never rewritten here —
 * it's the durable record of what a teacher actually asked for at
 * registration. Preference resolution follows `mergedIntoId` at read time
 * instead (see resolvePreferredDepartmentId in server/staff/departmentAssignment.ts).
 */
export async function mergeDepartmentInTx(
  tx: TxClient,
  input: { sourceId: string; targetId: string; actorId: string }
): Promise<MergeDepartmentResult> {
  if (input.sourceId === input.targetId) {
    throw new DepartmentMergeError("A department cannot be merged into itself.");
  }

  const [source, target] = await Promise.all([
    tx.department.findUnique({ where: { id: input.sourceId } }),
    tx.department.findUnique({ where: { id: input.targetId } }),
  ]);
  if (!source || source.deletedAt) throw new DepartmentMergeError("Source department not found.", "NOT_FOUND");
  if (!target || target.deletedAt) throw new DepartmentMergeError("Target department not found.", "NOT_FOUND");
  if (source.systemKey === "CAMP_COMMAND" || target.systemKey === "CAMP_COMMAND") {
    throw new DepartmentMergeError("The Camp Command department cannot be merged.", "FORBIDDEN");
  }
  if (source.organizationId !== target.organizationId || source.campId !== target.campId) {
    throw new DepartmentMergeError("Both departments must belong to the same camp.");
  }

  const [sourcePositions, targetPositions] = await Promise.all([
    tx.position.findMany({ where: { departmentId: input.sourceId, deletedAt: null } }),
    tx.position.findMany({ where: { departmentId: input.targetId, deletedAt: null } }),
  ]);
  const targetPositionByName = new Map(targetPositions.map((position) => [position.name.trim().toLowerCase(), position]));

  let movedPositions = 0;
  let collapsedPositions = 0;
  let reassignedAssignments = 0;
  let demotedAssignments = 0;
  const affectedStaffIds = new Set<string>();
  const positionRemap = new Map<string, string>(); // collapsed source position id -> surviving target position id

  for (const position of sourcePositions) {
    const assignments = await tx.positionAssignment.findMany({ where: { positionId: position.id }, select: { id: true, staffId: true } });
    for (const assignment of assignments) affectedStaffIds.add(assignment.staffId);

    const match = targetPositionByName.get(position.name.trim().toLowerCase());
    if (match) {
      // Same-named role already exists on the target — move assignments onto
      // it and retire the duplicate position rather than keeping two heads.
      if (assignments.length) {
        await tx.positionAssignment.updateMany({ where: { positionId: position.id }, data: { positionId: match.id } });
        reassignedAssignments += assignments.length;
      }
      if (EXCLUSIVE_ROLE_KINDS.has(match.roleKind)) {
        const currentOnMatch = await tx.positionAssignment.findMany({
          where: { positionId: match.id, isCurrent: true },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
        });
        if (currentOnMatch.length > 1) {
          const [, ...extras] = currentOnMatch;
          for (const extra of extras) {
            await tx.positionAssignment.update({
              where: { id: extra.id },
              data: { isCurrent: false, endDate: new Date(), reason: `Ended by department merge — ${match.name} already had a current occupant.` },
            });
            demotedAssignments += 1;
          }
        }
      }
      await tx.position.update({ where: { id: position.id }, data: { deletedAt: new Date() } });
      positionRemap.set(position.id, match.id);
      collapsedPositions += 1;
    } else {
      await tx.position.update({ where: { id: position.id }, data: { departmentId: input.targetId } });
      movedPositions += 1;
    }
  }

  const childDepartments = await tx.department.findMany({ where: { parentDepartmentId: input.sourceId, deletedAt: null }, select: { id: true } });
  for (const child of childDepartments) {
    await tx.department.update({ where: { id: child.id }, data: { parentDepartmentId: input.targetId } });
  }

  const checklistItems = await tx.departmentChecklistItem.findMany({ where: { departmentId: input.sourceId } });
  for (const item of checklistItems) {
    const remappedPositionId = item.positionId && positionRemap.has(item.positionId) ? positionRemap.get(item.positionId)! : item.positionId;
    await tx.departmentChecklistItem.update({ where: { id: item.id }, data: { departmentId: input.targetId, positionId: remappedPositionId } });
  }

  const announcementsMoved = (await tx.departmentAnnouncement.updateMany({ where: { departmentId: input.sourceId }, data: { departmentId: input.targetId } })).count;
  const documentsMoved = (await tx.departmentDocument.updateMany({ where: { departmentId: input.sourceId }, data: { departmentId: input.targetId } })).count;

  // DepartmentChecklistExecution and DepartmentReport are onDelete: Restrict
  // historical records — deliberately left on the source department, which
  // stays soft-deleted (Trash-recoverable) rather than hard-deleted.

  const staffOnSource = await tx.staffProfile.findMany({ where: { departmentId: input.sourceId, deletedAt: null }, select: { id: true } });
  for (const staff of staffOnSource) affectedStaffIds.add(staff.id);
  const movedStaffCount = (await tx.staffProfile.updateMany({ where: { departmentId: input.sourceId, deletedAt: null }, data: { departmentId: input.targetId } })).count;

  for (const staffId of affectedStaffIds) {
    await syncStaffProfileFromPositions(tx, staffId);
  }

  let capacityOverflow = false;
  if (target.maxCapacity != null) {
    const finalCount = await tx.staffProfile.count({ where: { departmentId: input.targetId, deletedAt: null, status: { in: ["PENDING", "APPROVED"] } } });
    capacityOverflow = finalCount > target.maxCapacity;
  }

  await tx.department.update({ where: { id: input.sourceId }, data: { deletedAt: new Date(), mergedIntoId: input.targetId } });

  await tx.departmentActivityLog.create({
    data: {
      departmentId: input.targetId,
      action: "DEPT_MERGED",
      actorId: input.actorId,
      details: { message: `Merged department "${source.name}" into this department.`, sourceId: input.sourceId, movedStaffCount, movedPositions, collapsedPositions },
    },
  });
  await logEvent(tx, {
    organizationId: source.organizationId,
    actorId: input.actorId,
    action: "DEPARTMENT_MERGED",
    subjectType: "DEPARTMENT",
    subjectId: input.targetId,
    previousValue: { sourceId: input.sourceId, sourceName: source.name },
    newValue: { targetId: input.targetId, targetName: target.name },
  });

  return {
    sourceId: input.sourceId,
    targetId: input.targetId,
    movedPositions,
    collapsedPositions,
    reassignedAssignments,
    demotedAssignments,
    movedStaffCount,
    childDepartmentsMoved: childDepartments.length,
    checklistItemsMoved: checklistItems.length,
    announcementsMoved,
    documentsMoved,
    capacityOverflow,
  };
}
