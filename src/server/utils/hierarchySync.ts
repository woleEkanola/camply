import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Synchronizes legacy StaffProfile fields for a given staff member based on their active PositionAssignments.
 * Reads exclusively from Position/PositionAssignment (the authoritative source) and mirrors to StaffProfile.
 */
export async function syncStaffProfileFromPositions(tx: TxClient, staffId: string) {
  const profile = await tx.staffProfile.findUniqueOrThrow({
    where: { id: staffId },
    select: { departmentId: true },
  });

  // 1. Fetch current, non-expired assignments for this staff profile,
  // including parent positions and their active occupants.
  const activeAssignments = await tx.positionAssignment.findMany({
    where: {
      staffId,
      isCurrent: true,
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      position: { status: "ACTIVE", deletedAt: null },
    },
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
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });

  if (activeAssignments.length === 0) {
    // A department membership can exist without a named role (for example,
    // after automatic department allocation). Removing the last role must not
    // silently erase that primary membership.
    await tx.staffProfile.update({
      where: { id: staffId },
      data: {
        departmentId: profile.departmentId,
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
  // StaffProfile.departmentId is the durable primary department. Keep it
  // even when that membership came from auto-allocation rather than a named
  // role. Only choose the oldest assignment when no primary exists yet.
  const departmentId = profile.departmentId
    ?? activeAssignments.find((assignment) => assignment.position.departmentId)?.position.departmentId
    ?? null;
  let reportsToId: string | null = null;
  let reportsToUserId: string | null = null;

  for (const assignment of activeAssignments) {
    const { position } = assignment;
    const nameLower = position.name.toLowerCase();

    // Determine leadership flags based on position naming conventions
    if (position.roleKind === "HEAD" || (nameLower.endsWith("head") && !nameLower.includes("assistant"))) {
      isDepartmentHead = true;
    } else if (position.roleKind === "ASSISTANT_HEAD" || nameLower.endsWith("assistant head") || nameLower.includes("assistant head")) {
      isAssistantHead = true;
    }

    if (nameLower.includes("monitor") && !nameLower.includes("assistant")) {
      isCampMonitor = true;
    } else if (nameLower.includes("assistant monitor")) {
      isAssistantMonitor = true;
    }

    // Determine reporting lines
    const parentPos = position.parentPosition;
    if (position.departmentId === departmentId && parentPos && !reportsToId && !reportsToUserId) {
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
