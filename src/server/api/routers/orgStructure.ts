import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/** Rejects PARENT outright — Camp Structure is a staff/admin-only module. */
function assertStaffModuleAccess(ctx: { session: any }) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.role === "PARENT") throw new TRPCError({ code: "FORBIDDEN", message: "Not available for this account type" });
  return currentUser;
}

function assertOrgAccess(currentUser: { role: string; organizationId?: string | null }, organizationId: string) {
  if (currentUser.organizationId !== organizationId && currentUser.role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

type StaffNode = {
  kind: "staff";
  staffProfileId: string;
  userId: string;
  name: string;
  role: string; // TEACHER | VOLUNTEER
  title: string | null; // "Department Head" | "Camp Monitor" | etc, display-only
  department: string | null;
  tribe: string | null;
  centre: string | null;
  reportsToId: string | null; // normalized node id (userId or staffProfileId), see build logic
  children: StaffNode[];
};

export const orgStructureRouter = createTRPCRouter({
  // ─── Leadership tree ────────────────────────────────────────────────────
  getLeadershipTree: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = assertStaffModuleAccess(ctx);
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
      const currentUser = assertStaffModuleAccess(ctx);
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
      const currentUser = assertStaffModuleAccess(ctx);
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
      const currentUser = assertStaffModuleAccess(ctx);

      if (currentUser.role === "TEACHER" || currentUser.role === "VOLUNTEER") {
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
      assertStaffModuleAccess(ctx);
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

  // ─── Search ──────────────────────────────────────────────────────────────
  search: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const currentUser = assertStaffModuleAccess(ctx);
      assertOrgAccess(currentUser, input.organizationId);
      const q = input.query;

      const [staff, departments, tribes, hostels] = await Promise.all([
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            campId: input.campId,
            OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }],
          },
          include: { department: true, assignedTribe: true, assignedVenue: true },
          take: 10,
        }),
        ctx.prisma.department.findMany({ where: { organizationId: input.organizationId, campId: input.campId, name: { contains: q, mode: "insensitive" } }, take: 5 }),
        ctx.prisma.tribe.findMany({ where: { campId: input.campId, name: { contains: q, mode: "insensitive" } }, take: 5 }),
        ctx.prisma.hostel.findMany({ where: { organizationId: input.organizationId, name: { contains: q, mode: "insensitive" } }, take: 5 }),
      ]);

      return [
        ...staff.map((s: any) => ({
          kind: "staff" as const,
          id: s.id,
          label: `${s.firstName} ${s.lastName}`,
          path: [s.department?.name, s.assignedTribe?.name, s.assignedVenue?.name].filter(Boolean).join(" · "),
        })),
        ...departments.map((d: any) => ({ kind: "department" as const, id: d.id, label: d.name, path: "Department" })),
        ...tribes.map((t: any) => ({ kind: "tribe" as const, id: t.id, label: t.name, path: "Tribe" })),
        ...hostels.map((h: any) => ({ kind: "hostel" as const, id: h.id, label: h.name, path: "Hostel" })),
      ];
    }),
});
