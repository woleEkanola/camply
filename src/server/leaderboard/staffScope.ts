/** Canonical group roll-up for staff scores across attendance, scans and points. */
export async function resolveStaffScoreScope(prisma: { staffProfile: { findUnique(args: any): Promise<any> } }, staffProfileId: string) {
  const staff = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { id: true, campId: true, assignedTribeId: true, preferredCampusId: true, userId: true, type: true },
  });
  if (!staff) return null;
  return {
    staffProfileId: staff.id,
    campId: staff.campId,
    tribeId: staff.assignedTribeId,
    campusId: staff.preferredCampusId,
    userId: staff.userId,
    type: staff.type,
  };
}
