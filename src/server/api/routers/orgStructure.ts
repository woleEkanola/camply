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

      // Top-of-chart: org admins (OWNER/ADMIN) + campus reps (CAMPUS_REPRESENTATIVE), one flat query.
      const leaders = await ctx.prisma.user.findMany({
        where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"] }, active: true },
      });

      // All staff for the camp, one flat query with everything the tree needs.
      const staff = await ctx.prisma.staffProfile.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, status: "APPROVED" },
        include: { user: true, department: true, assignedTribe: true, assignedVenue: true },
      });

      // Build node id space: "user:<id>" for leaders, "staff:<id>" for staff.
      type NodeId = string;
      const nodes = new Map<NodeId, StaffNode & { parentId: NodeId | null }>();

      for (const leader of leaders) {
        const title = leader.role === "OWNER" ? "Camp Director" : leader.role === "ADMIN" ? "Camp Administrator" : "Campus Representative";
        nodes.set(`user:${leader.id}`, {
          kind: "staff",
          staffProfileId: "",
          userId: leader.id,
          name: `${leader.firstName ?? ""} ${leader.lastName ?? ""}`.trim() || leader.email,
          role: leader.role,
          title,
          department: null,
          tribe: null,
          centre: null,
          reportsToId: null, // leaders don't have a reportsTo relation today; wired up as roots
          children: [],
          parentId: leader.role === "CAMPUS_REPRESENTATIVE" ? null : null, // owner/admin/campus-reps are all roots for now (no leader-to-leader hierarchy modeled)
        });
      }

      for (const s of staff) {
        let title: string | null = null;
        if (s.isDepartmentHead) title = "Department Head";
        else if (s.isAssistantHead) title = "Assistant Department Head";
        else if (s.isCampMonitor) title = "Camp Monitor";
        else if (s.isAssistantMonitor) title = "Assistant Camp Monitor";

        const parentId: NodeId | null = s.reportsToId ? `staff:${s.reportsToId}` : s.reportsToUserId ? `user:${s.reportsToUserId}` : null;

        nodes.set(`staff:${s.id}`, {
          kind: "staff",
          staffProfileId: s.id,
          userId: s.userId,
          name: `${s.firstName} ${s.lastName}`.trim(),
          role: s.type,
          title,
          department: s.department?.name ?? null,
          tribe: s.assignedTribe?.name ?? null,
          centre: s.assignedVenue?.name ?? null,
          reportsToId: parentId,
          children: [],
          parentId,
        });
      }

      // Attach children; normalize dangling/self/both-set parent refs defensively
      // rather than crashing the tree render (see plan risk notes).
      const roots: StaffNode[] = [];
      for (const [id, node] of nodes) {
        if (node.parentId && node.parentId !== id && nodes.has(node.parentId)) {
          nodes.get(node.parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      const strip = (n: StaffNode & { parentId?: NodeId | null }): StaffNode => {
        const { parentId, ...rest } = n as any;
        return { ...rest, children: rest.children.map(strip) };
      };

      return roots.map(strip);
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
        where: { campId: input.campId },
        include: {
          _count: { select: { registrations: true } },
          assignedStaff: { where: { status: "APPROVED" }, include: { user: true, assignedHostel: true } },
        },
        orderBy: { name: "asc" },
      });

      return tribes.map((t: any) => {
        const monitor = t.assignedStaff.find((s: any) => s.isCampMonitor);
        const assistantMonitor = t.assignedStaff.find((s: any) => s.isAssistantMonitor);
        const hostelNames = Array.from(new Set(t.assignedStaff.map((s: any) => s.assignedHostel?.name).filter(Boolean)));
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          logoUrl: t.logoUrl,
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
