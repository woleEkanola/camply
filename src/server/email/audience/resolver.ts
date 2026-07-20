import type { PrismaClient } from "@prisma/client";
import type { AudienceFilter } from "./filters";

type TxClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface ResolvedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface AudienceResult {
  users: ResolvedUser[];
  count: number;
}

function ageToDate(min?: number, max?: number): { minDate?: Date; maxDate?: Date } {
  const now = new Date();
  const result: { minDate?: Date; maxDate?: Date } = {};
  if (max !== undefined) {
    result.minDate = new Date(now.getFullYear() - max - 1, now.getMonth(), now.getDate());
  }
  if (min !== undefined) {
    result.maxDate = new Date(now.getFullYear() - min, now.getMonth(), now.getDate());
  }
  return result;
}

function parseDate(val?: string): Date | undefined {
  return val ? new Date(val) : undefined;
}

export async function resolveAudience(
  prisma: TxClient,
  organizationId: string,
  filter: AudienceFilter
): Promise<AudienceResult> {
  const { recipientType, filters } = filter;

  const where: Record<string, unknown> = {
    organizationId,
    active: true,
    deletedAt: null,
  };

  // ── Role filter ──────────────────────────────────────────────────────────
  const roles: string[] = [];
  if (recipientType === "ALL" || recipientType === "PARENTS") roles.push("PARENT");
  if (recipientType === "ALL" || recipientType === "TEACHERS") roles.push("TEACHER");
  if (recipientType === "ALL" || recipientType === "VOLUNTEERS") roles.push("VOLUNTEER");
  if (recipientType === "CAMPUS_REPS") roles.push("CAMPUS_REPRESENTATIVE");
  if (recipientType === "ADMINS") roles.push("SUPER_ADMIN", "OWNER", "ADMIN");

  where.role = { in: roles };

  // ── Email verified ───────────────────────────────────────────────────────
  if (filters.emailVerified === true) {
    where.emailVerified = { not: null };
  } else if (filters.emailVerified === false) {
    where.emailVerified = null;
  }

  // ── Gender (post-filter via camper/staff) ──────────────────────────────────
  let genderFilter: string | undefined;
  if (filters.gender) {
    genderFilter = filters.gender;
  }

  // ── Age range (post-filter via camper dateOfBirth) ─────────────────────────
  const ageBounds = ageToDate(filters.ageRange?.min, filters.ageRange?.max);

  // ── Find matching users ───────────────────────────────────────────────────
  const users = await (prisma as any).user.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      staffProfiles: {
        select: {
          id: true,
          type: true,
          status: true,
          gender: true,
          assignedVenueId: true,
          assignedTribeId: true,
          departmentId: true,
          preferredCampusId: true,
        },
        where: { deletedAt: null },
      },
      campers: {
        select: {
          id: true,
          gender: true,
          dateOfBirth: true,
          registrations: {
            select: {
              id: true,
              status: true,
              campId: true,
              campusId: true,
              tribeId: true,
              venueId: true,
              submittedAt: true,
              approvedAt: true,
              checkedInAt: true,
              checkedOutAt: true,
              room: {
                select: { hostelId: true },
              },
            },
            where: { deletedAt: null },
          },
        },
        where: { deletedAt: null },
      },
    },
  });

  // ── Post-filtering ────────────────────────────────────────────────────────
  let filtered: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    staffProfiles: any[];
    campers: any[];
  }> = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    staffProfiles: (u as any).staffProfiles ?? [],
    campers: (u as any).campers ?? [],
  }));

  // Registration status
  if (filters.registrationStatus && filters.registrationStatus.length > 0) {
    const statuses = new Set(filters.registrationStatus);
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => statuses.has(r.status))
      )
    );
  }

  // Camp
  if (filters.campId) {
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => r.campId === filters.campId)
      )
    );
  }

  // Campus
  if (filters.campusId) {
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => r.campusId === filters.campusId)
      ) ||
      user.staffProfiles?.some((s: any) => s.preferredCampusId === filters.campusId)
    );
  }

  // Tribe
  if (filters.tribeId) {
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => r.tribeId === filters.tribeId)
      ) ||
      user.staffProfiles?.some((s: any) => s.assignedTribeId === filters.tribeId)
    );
  }

  // Hostel
  if (filters.hostelId) {
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => r.room?.hostelId === filters.hostelId)
      )
    );
  }

  // Department
  if (filters.departmentId) {
    filtered = filtered.filter((user: any) =>
      user.staffProfiles?.some((s: any) => s.departmentId === filters.departmentId)
    );
  }

  // Venue (teacher filter - staff assigned to a venue)
  if (filters.teacherId) {
    // Not a venue filter - teacherId filter not needed; venue is implicit via campId filter on staff assignments
  }

  // Volunteer department
  if (filters.volunteerDepartment) {
    filtered = filtered.filter((user: any) => {
      if (user.role !== "VOLUNTEER") return false;
      return user.staffProfiles?.some((s: any) => {
        const dept = filters.volunteerDepartment;
        return s.type === "VOLUNTEER" && s.departmentId === dept;
      });
    });
  }

  // Gender
  if (genderFilter) {
    filtered = filtered.filter((user: any) => {
      return (
        user.campers?.some((c: any) => c.gender === genderFilter) ||
        user.staffProfiles?.some((s: any) => s.gender === genderFilter)
      );
    });
  }

  // Age range
  if (ageBounds.minDate || ageBounds.maxDate) {
    filtered = filtered.filter((user: any) => {
      return user.campers?.some((c: any) => {
        if (!c.dateOfBirth) return false;
        const dob = new Date(c.dateOfBirth);
        if (ageBounds.minDate && dob < ageBounds.minDate) return false;
        if (ageBounds.maxDate && dob > ageBounds.maxDate) return false;
        return true;
      });
    });
  }

  // Application/submitted date
  if (filters.applicationDate) {
    const from = parseDate(filters.applicationDate.from);
    const to = parseDate(filters.applicationDate.to);
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => {
          if (!r.submittedAt) return false;
          const d = new Date(r.submittedAt);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
      )
    );
  }

  // Approval date
  if (filters.approvalDate) {
    const from = parseDate(filters.approvalDate.from);
    const to = parseDate(filters.approvalDate.to);
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => {
          if (!r.approvedAt) return false;
          const d = new Date(r.approvedAt);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
      )
    );
  }

  // Check-in date
  if (filters.checkInDate) {
    const from = parseDate(filters.checkInDate.from);
    const to = parseDate(filters.checkInDate.to);
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => {
          if (!r.checkedInAt) return false;
          const d = new Date(r.checkedInAt);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
      )
    );
  }

  // Check-out date
  if (filters.checkOutDate) {
    const from = parseDate(filters.checkOutDate.from);
    const to = parseDate(filters.checkOutDate.to);
    filtered = filtered.filter((user: any) =>
      user.campers?.some((camper: any) =>
        camper.registrations?.some((r: any) => {
          if (!r.checkedOutAt) return false;
          const d = new Date(r.checkedOutAt);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
      )
    );
  }

  // Previous campaign filters — deferred to EmailRecipient lookup
  // hasReceivedPreviousCampaign / hasOpenedPreviousCampaign / hasNotOpenedPreviousCampaign
  for (const key of ["hasReceivedPreviousCampaign", "hasOpenedPreviousCampaign", "hasNotOpenedPreviousCampaign"] as const) {
    const campaignFilter = (filters as any)[key];
    if (campaignFilter?.campaignId) {
      const requireOpened = key === "hasOpenedPreviousCampaign";
      const requireNotOpened = key === "hasNotOpenedPreviousCampaign";

      const existing = await (prisma as any).emailRecipient.findMany({
        where: {
          campaignId: campaignFilter.campaignId,
          ...(requireOpened ? { openedAt: { not: null } } : {}),
          ...(requireNotOpened ? { openedAt: null } : {}),
          userId: { in: filtered.map((u) => u.id) },
        },
        select: { userId: true },
      });

      const existingIds = new Set(existing.map((r: { userId: string }) => r.userId));
      filtered = filtered.filter((u: { id: string }) => existingIds.has(u.id));
    }
  }

  // Failed delivery — query EmailRecipient for any failed receipts
  if (filters.hasFailedDelivery) {
    const failed = await (prisma as any).emailRecipient.findMany({
      where: {
        deliveryStatus: { in: ["FAILED", "BOUNCED"] },
        userId: { in: filtered.map((u) => u.id) },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const failedIds = new Set(failed.map((r: { userId: string }) => r.userId));
    filtered = filtered.filter((u: { id: string }) => failedIds.has(u.id));
  }

  return {
    users: filtered.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
    })),
    count: filtered.length,
  };
}

export async function previewAudience(
  prisma: TxClient,
  organizationId: string,
  filter: AudienceFilter
): Promise<{ count: number }> {
  const result = await resolveAudience(prisma, organizationId, filter);
  return { count: result.count };
}
