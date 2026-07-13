import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Synchronizes legacy StaffProfile fields for a given staff member based on their active PositionAssignments.
 * Reads exclusively from Position/PositionAssignment (the authoritative source) and mirrors to StaffProfile.
 */
export async function syncStaffProfileFromPositions(tx: TxClient, staffId: string) {
  // 1. Fetch current active assignments for this staff profile, including parent positions and their active occupants.
  const activeAssignments = await tx.positionAssignment.findMany({
    where: { staffId, isCurrent: true },
    include: {
      position: {
        include: {
          parentPosition: {
            include: {
              assignments: {
                where: { isCurrent: true },
                include: { staff: true },
              },
            },
          },
        },
      },
    },
  });

  if (activeAssignments.length === 0) {
    // If no active assignments exist, clear legacy reporting/leadership flags.
    await tx.staffProfile.update({
      where: { id: staffId },
      data: {
        departmentId: null,
        isDepartmentHead: false,
        isAssistantHead: false,
        isCampMonitor: false,
        isAssistantMonitor: false,
        reportsToId: null,
        reportsToUserId: null,
      },
    });
    return;
  }

  // 2. Aggregate flags and values from active assignments
  let isDepartmentHead = false;
  let isAssistantHead = false;
  let isCampMonitor = false;
  let isAssistantMonitor = false;
  let departmentId: string | null = null;
  let reportsToId: string | null = null;
  let reportsToUserId: string | null = null;

  for (const assignment of activeAssignments) {
    const { position } = assignment;
    const nameLower = position.name.toLowerCase();

    // Determine department
    if (position.departmentId) {
      departmentId = position.departmentId;
    }

    // Determine leadership flags based on position naming conventions
    if (nameLower.endsWith("head") && !nameLower.includes("assistant")) {
      isDepartmentHead = true;
    } else if (nameLower.endsWith("assistant head") || nameLower.includes("assistant head")) {
      isAssistantHead = true;
    }

    if (nameLower.includes("monitor") && !nameLower.includes("assistant")) {
      isCampMonitor = true;
    } else if (nameLower.includes("assistant monitor")) {
      isAssistantMonitor = true;
    }

    // Determine reporting lines
    const parentPos = position.parentPosition;
    if (parentPos) {
      // Find the first current occupant of the parent position
      const parentAssignment = parentPos.assignments[0];
      if (parentAssignment) {
        const supervisor = parentAssignment.staff;
        // Check if the supervisor is a root admin (associated directly to Owner/Admin user)
        // Root admins have userId and we can set reportsToUserId.
        // Wait, check the DB schema: reportsToUserId connects directly to User.
        if (supervisor.userId && (parentPos.name === "Camp Director" || parentPos.name === "Camp Administrator" || parentPos.name === "Campus Representative")) {
          reportsToUserId = supervisor.userId;
          reportsToId = null;
        } else {
          reportsToId = supervisor.id;
          reportsToUserId = null;
        }
      }
    }
  }

  // 3. Perform legacy StaffProfile update
  await tx.staffProfile.update({
    where: { id: staffId },
    data: {
      departmentId,
      isDepartmentHead,
      isAssistantHead,
      isCampMonitor,
      isAssistantMonitor,
      reportsToId,
      reportsToUserId,
    },
  });
}

/**
 * Recalculates and updates legacy columns for all staff members who occupy a position,
 * or occupy sub-positions underneath a changed parent position.
 */
export async function syncPositionOccupantsAndDescendants(tx: TxClient, positionId: string) {
  // Get all descendant positions recursively
  const getDescendants = async (id: string): Promise<string[]> => {
    const children = await tx.position.findMany({
      where: { parentPositionId: id, deletedAt: null },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    let allIds = [...childIds];
    for (const childId of childIds) {
      const descendants = await getDescendants(childId);
      allIds = [...allIds, ...descendants];
    }
    return allIds;
  };

  const affectedPositionIds = [positionId, ...(await getDescendants(positionId))];

  // Find all active staff assignments in these positions
  const assignments = await tx.positionAssignment.findMany({
    where: { positionId: { in: affectedPositionIds }, isCurrent: true },
    select: { staffId: true },
  });

  const staffIds = Array.from(new Set(assignments.map((a) => a.staffId)));

  // Sync each staff profile
  for (const staffId of staffIds) {
    await syncStaffProfileFromPositions(tx, staffId);
  }
}
