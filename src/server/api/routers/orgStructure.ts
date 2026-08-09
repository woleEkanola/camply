import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { staffChipSelect, toStaffChip, type StaffChip, type DepartmentGroup, type CampDirectoryResult } from "./_shared/staffChip";
import { STAFF_PRESENCE_STATIONS, STAFF_CHECK_IN_STATION } from "../../../lib/staffPresence";
import { hasStaffCapability } from "../../auth/capabilities";

const STAFF_MODULE_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/** Rejects PARENT outright — Camp Structure is a staff/admin-only module. */
async function assertStaffModuleAccess(ctx: { session: any; userId: string }) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Staff modules are for people with staff capability. Gate on that, not on
  // `role !== "PARENT"`: a parent who also teaches keeps role PARENT and would
  // otherwise be locked out of modules they legitimately belong to — while a
  // parent with no staff profile must still be refused.
  // See server/auth/capabilities.ts.
  if (STAFF_MODULE_ADMIN_ROLES.includes(currentUser.role)) return currentUser;
  if (await hasStaffCapability(ctx.userId, { organizationId: currentUser.organizationId ?? undefined })) {
    return currentUser;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not available for this account type" });
}

function assertOrgAccess(currentUser: { role: string; organizationId?: string | null }, organizationId: string) {
  if (currentUser.organizationId !== organizationId && currentUser.role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const orgStructureRouter = createTRPCRouter({
  // ─── Leadership tree ────────────────────────────────────────────────────
  getLeadershipTree: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);

      const positions = await ctx.prisma.position.findMany({
        where: { campId: input.campId, deletedAt: null },
        include: {
          department: true,
          assignments: {
            where: { isCurrent: true },
            include: {
              staff: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });

      // Build hierarchical tree structure of positions
      type PositionNode = typeof positions[number] & { children: PositionNode[] };
      const nodeMap = new Map<string, PositionNode>();

      for (const pos of positions) {
        nodeMap.set(pos.id, { ...pos, children: [] });
      }

      const roots: PositionNode[] = [];

      for (const node of nodeMap.values()) {
        if (node.parentPositionId && nodeMap.has(node.parentPositionId)) {
          nodeMap.get(node.parentPositionId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    }),
  // ─── Department structure ──────────────────────────────────────────────
  getDepartmentStructure: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);

      const departments = await ctx.prisma.department.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, status: "ACTIVE", deletedAt: null },
        include: {
          staff: { where: { status: "APPROVED" }, include: { user: true } },
          _count: { select: { staff: { where: { status: { in: ["PENDING", "APPROVED"] }, deletedAt: null } } } },
        },
        orderBy: { name: "asc" },
      });

      return departments.map((d: any) => {
        const head = d.staff.find((s: any) => s.isDepartmentHead);
        const assistantHead = d.staff.find((s: any) => s.isAssistantHead);
        const volunteerCount = d.staff.filter((s: any) => s.type === "VOLUNTEER").length;
        return {
          id: d.id,
          name: d.name,
          description: d.description,
          responsibilities: d.responsibilities,
          status: d.status,
          head: head ? { id: head.id, name: `${head.firstName} ${head.lastName}` } : null,
          assistantHead: assistantHead ? { id: assistantHead.id, name: `${assistantHead.firstName} ${assistantHead.lastName}` } : null,
          memberCount: d.staff.length,
          volunteerCount,
          maxCapacity: d.maxCapacity,
          // Pending + Approved — same definition the capacity cap enforces,
          // so this reflects reserved slots, not just confirmed Members.
          signedUpCount: d._count.staff,
        };
      });
    }),

  // ─── Tribe structure ────────────────────────────────────────────────────
  getTribeStructure: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);

      const tribes = await ctx.prisma.tribe.findMany({
        where: { campId: input.campId, deletedAt: null },
        include: {
          _count: { select: { registrations: { where: { deletedAt: null } } } },
          assignedStaff: { where: { status: "APPROVED" }, include: { user: true, assignedHostel: true } },
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });

      return tribes.map((t: any) => {
        const monitor = t.assignedStaff.find((s: any) => s.isCampMonitor);
        const assistantMonitor = t.assignedStaff.find((s: any) => s.isAssistantMonitor);
        const hostelNames = Array.from(new Set(t.assignedStaff.map((s: any) => s.assignedHostel?.name).filter(Boolean)));
        return {
          id: t.id,
          name: t.name,
          code: t.code,
          color: t.color,
          displayOrder: t.displayOrder,
          logoUrl: t.logoUrl,
          bannerUrl: t.bannerUrl,
          description: t.description,
          meaning: t.meaning,
          motto: t.motto,
          scripture: t.scripture,
          gender: t.gender,
          ageRange: t.ageRange,
          allocationStrategy: t.allocationStrategy,
          maxCapacity: t.maxCapacity,
          status: t.status,
          points: t.points,
          camperCount: t._count.registrations,
          monitor: monitor ? { id: monitor.id, name: `${monitor.firstName} ${monitor.lastName}` } : null,
          assistantMonitor: assistantMonitor ? { id: assistantMonitor.id, name: `${assistantMonitor.firstName} ${assistantMonitor.lastName}` } : null,
          hostels: hostelNames,
        };
      });
    }),


  // ─── My Position ────────────────────────────────────────────────────────
  getMyPosition: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffModuleAccess(ctx);

      // Anyone holding a staff profile has a position to show, whatever their
      // primary role happens to be.
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER" && currentUser.role !== "ADMIN") {
        const profile = await ctx.prisma.staffProfile.findFirst({
          where: { userId: ctx.userId, campId: input.campId },
          include: {
            department: true,
            assignedTribe: true,
            assignedVenue: true,
            assignedHostel: true,
            assignedRoom: true,
            reportsTo: { include: { user: true } },
            reportsToUser: true,
            directReports: { include: { user: true } },
            camperAssignments: true,
          },
        });
        if (!profile) return null;

        const reportsToName = profile.reportsTo
          ? `${profile.reportsTo.firstName} ${profile.reportsTo.lastName}`
          : profile.reportsToUser
            ? `${profile.reportsToUser.firstName ?? ""} ${profile.reportsToUser.lastName ?? ""}`.trim() || profile.reportsToUser.email
            : null;

        let title: string | null = null;
        if (profile.isDepartmentHead) title = "Department Head";
        else if (profile.isCampMonitor) title = "Camp Monitor";
        else if (profile.isAssistantMonitor) title = "Assistant Camp Monitor";

        return {
          role: profile.type,
          title,
          department: profile.department?.name ?? null,
          tribe: profile.assignedTribe?.name ?? null,
          centre: profile.assignedVenue?.name ?? null,
          reportsTo: reportsToName,
          directReportsCount: profile.directReports.length,
          camperCount: profile.camperAssignments.length,
          hostel: profile.assignedHostel?.name ?? null,
          room: profile.assignedRoom?.name ?? null,
        };
      }

      if (currentUser.role === "CAMPUS_REPRESENTATIVE") {
        const campus = await ctx.prisma.campus.findFirst({ where: { reps: { some: { id: ctx.userId } } } });
        return { role: "CAMPUS_REPRESENTATIVE", title: "Campus Representative", centre: campus?.name ?? null, department: null, tribe: null, reportsTo: null, directReportsCount: null, camperCount: null, hostel: null, room: null };
      }

      if (currentUser.role === "OWNER" || currentUser.role === "ADMIN") {
        return {
          role: currentUser.role,
          title: currentUser.role === "OWNER" ? "Camp Director" : "Camp Administrator",
          centre: null, department: null, tribe: null, reportsTo: null, directReportsCount: null, camperCount: null, hostel: null, room: null,
        };
      }

      return null;
    }),

  // ─── Person Profile Drawer payload ──────────────────────────────────────
  getPersonProfile: protectedProcedure
    .input(z.object({ staffProfileId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertStaffModuleAccess(ctx);
      const profile = await ctx.prisma.staffProfile.findUnique({
        where: { id: input.staffProfileId },
        include: {
          user: true,
          department: true,
          assignedTribe: true,
          assignedVenue: true,
          assignedHostel: true,
          assignedRoom: true,
          reportsTo: { include: { user: true } },
          reportsToUser: true,
          directReports: { include: { user: true } },
          camperAssignments: { include: { registration: { include: { camper: true } } } },
        },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      return profile;
    }),

  // ─── Camp Directory (mobile-first redesign) ──────────────────────────────
  // Single-page replacement for the Leadership/Directory/Departments tabs:
  // one procedure returns every department pre-grouped into Head/Assistant
  // Heads/Members chips, plus an "unassigned" bucket, plus a chip-complete
  // shape (photoUrl/phone/campus/position title) so the profile sheet needs
  // no follow-up fetch. See backlog.md "Camp Structure Redesign".
  getCampDirectory: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);

      const [departments, staff] = await Promise.all([
        ctx.prisma.department.findMany({
          where: { organizationId: input.organizationId, campId: input.campId, status: "ACTIVE", deletedAt: null },
          select: { id: true, name: true, description: true, status: true, maxCapacity: true, responsibilities: true },
          orderBy: { name: "asc" },
        }),
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            campId: input.campId,
            deletedAt: null,
            status: { in: ["APPROVED", "PENDING"] },
          },
          select: staffChipSelect,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        }),
      ]);

      const chips = staff.map(toStaffChip);
      const byDept = new Map<string, StaffChip[]>();
      const unassigned: StaffChip[] = [];
      for (const chip of chips) {
        if (!chip.departmentId) {
          unassigned.push(chip);
          continue;
        }
        const bucket = byDept.get(chip.departmentId);
        if (bucket) bucket.push(chip);
        else byDept.set(chip.departmentId, [chip]);
      }

      const departmentGroups: DepartmentGroup[] = departments.map((d) => {
        const members = byDept.get(d.id) ?? [];
        // .filter(), not .find() — a department can have more than one
        // Assistant Head. The `&& !isDepartmentHead` guard matters: a staff
        // member holding two positions (e.g. "X Head" + "Y Assistant Head")
        // would otherwise render twice in the same section.
        const heads = members.filter((s) => s.isDepartmentHead);
        const assistantHeads = members.filter((s) => s.isAssistantHead && !s.isDepartmentHead);
        const rest = members.filter((s) => !s.isDepartmentHead && !s.isAssistantHead);
        const approvedCount = members.filter((s) => s.status === "APPROVED").length;
        const volunteerCount = members.filter((s) => s.type === "VOLUNTEER").length;

        return {
          id: d.id,
          name: d.name,
          description: d.description,
          status: d.status,
          maxCapacity: d.maxCapacity,
          responsibilities: d.responsibilities,
          heads,
          assistantHeads,
          members: rest,
          memberCount: members.length,
          approvedCount,
          signedUpCount: members.length, // query already filters to PENDING+APPROVED
          volunteerCount,
        };
      });

      const result: CampDirectoryResult = {
        departments: departmentGroups,
        unassigned,
        totalStaff: chips.length,
        generatedAt: new Date(),
      };
      return result;
    }),

  // ─── On Site presence (read-only; no new tracking) ───────────────────────
  // StaffScanEvent already exists and is written by scan.processStaffScan.
  // This surfaces "is this staff member on site right now" without adding
  // any schema/column — the badge is simply absent when no scan exists.
  getOnSiteStaff: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const events = await ctx.prisma.staffScanEvent.findMany({
        where: {
          result: "SUCCESS",
          timestamp: { gte: dayStart },
          station: { in: [...STAFF_PRESENCE_STATIONS] },
          OR: [{ campId: input.campId }, { campId: null, staffProfile: { campId: input.campId } }],
          staffProfile: { organizationId: input.organizationId, deletedAt: null },
        },
        // `distinct` compiles to Postgres DISTINCT ON, which requires the
        // leading orderBy column to match the distinct column — hence
        // staffProfileId first, NOT timestamp first.
        orderBy: [{ staffProfileId: "asc" }, { timestamp: "desc" }],
        distinct: ["staffProfileId"],
        select: { staffProfileId: true, station: true, timestamp: true },
      });

      const onSiteStaffIds: string[] = [];
      const lastSeen: Record<string, string> = {};
      for (const e of events) {
        lastSeen[e.staffProfileId] = e.timestamp.toISOString();
        if (e.station === STAFF_CHECK_IN_STATION) onSiteStaffIds.push(e.staffProfileId);
      }

      return { onSiteStaffIds, lastSeen, asOf: new Date() };
    }),

  // ─── Universal directory search ──────────────────────────────────────────
  // Replaces `search` above (kept for now, deleted alongside the page
  // rewire): adds phone/email/campus/tribe/position matching, filters out
  // soft-deleted/rejected staff, and returns chip-complete staff results so
  // a search hit opens the profile sheet with zero extra fetch.
  searchDirectory: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), query: z.string().min(2), limit: z.number().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const currentUser = assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);
      const q = input.query;
      const digits = q.replace(/\D/g, "");

      const [staffMatches, phoneCandidates, departments, positions, tribes, hostels] = await Promise.all([
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            campId: input.campId,
            deletedAt: null,
            status: { in: ["APPROVED", "PENDING"] },
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { preferredCampus: { name: { contains: q, mode: "insensitive" as const } } },
              { assignedTribe: { name: { contains: q, mode: "insensitive" as const } } },
              { positionAssignments: { some: { isCurrent: true, position: { name: { contains: q, mode: "insensitive" as const } } } } },
            ],
          },
          select: staffChipSelect,
          take: input.limit,
        }),
        // Phone numbers are stored with punctuation (e.g. "+234-800-0600"), so
        // a plain `contains` on a digits-only search term misses any match
        // whose digit run straddles a stored separator — `phone: { contains:
        // "8000600" }` never matches "+234-800-0600" because of the literal
        // dash between "800" and "0600". Fetch a bounded roster instead and
        // compare digit-normalized in JS; camp rosters are small enough that
        // this is cheap and avoids raw SQL entirely (same "bounded full
        // fetch over cleverness" trade-off already used for the Positions
        // assign picker's staff.adminList limit).
        digits.length >= 3
          ? ctx.prisma.staffProfile.findMany({
              where: { organizationId: input.organizationId, campId: input.campId, deletedAt: null, status: { in: ["APPROVED", "PENDING"] } },
              select: staffChipSelect,
              take: 200,
            })
          : Promise.resolve([]),
        ctx.prisma.department.findMany({
          where: { organizationId: input.organizationId, campId: input.campId, deletedAt: null, name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true, _count: { select: { staff: { where: { status: { in: ["PENDING", "APPROVED"] }, deletedAt: null } } } } },
          take: 5,
        }),
        ctx.prisma.position.findMany({
          where: { campId: input.campId, deletedAt: null, name: { contains: q, mode: "insensitive" } },
          select: {
            id: true,
            name: true,
            departmentId: true,
            department: { select: { name: true } },
            assignments: { where: { isCurrent: true }, select: { staff: { select: { firstName: true, lastName: true } } }, take: 1 },
          },
          take: 5,
        }),
        ctx.prisma.tribe.findMany({
          where: { campId: input.campId, deletedAt: null, name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true },
          take: 5,
        }),
        ctx.prisma.hostel.findMany({
          where: { organizationId: input.organizationId, name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true },
          take: 5,
        }),
      ]);

      const phoneMatches = phoneCandidates.filter((s) => s.phone.replace(/\D/g, "").includes(digits));
      const staffById = new Map<string, (typeof staffMatches)[number]>();
      for (const s of [...staffMatches, ...phoneMatches]) staffById.set(s.id, s);
      const staff = [...staffById.values()].slice(0, input.limit);

      return {
        staff: staff.map(toStaffChip),
        departments: departments.map((d) => ({ id: d.id, name: d.name, memberCount: d._count.staff })),
        positions: positions.map((p) => ({
          id: p.id,
          name: p.name,
          departmentId: p.departmentId,
          departmentName: p.department?.name ?? null,
          occupantName: p.assignments[0]?.staff ? `${p.assignments[0].staff.firstName} ${p.assignments[0].staff.lastName}` : null,
        })),
        tribes: tribes.map((t) => ({ id: t.id, name: t.name })),
        hostels: hostels.map((h) => ({ id: h.id, name: h.name })),
      };
    }),
});
