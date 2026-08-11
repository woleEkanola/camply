import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

export interface GlobalSearchResult {
  id: string;
  type: "camper" | "registration" | "staff" | "campus";
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  camperId?: string;
  registrationId?: string;
  userId?: string;
  staffProfileId?: string;
  campusId?: string;
}

export const searchRouter = createTRPCRouter({
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const q = input.query.trim();
      if (!q) return [];

      // Non-SUPER_ADMIN callers always search their own org, never one from
      // the input — the previous version trusted input.organizationId
      // outright, and fell back to searching *every* organization in the
      // system whenever it (or the caller's own org) was empty. SUPER_ADMINs
      // are org-less by design (User.organizationId is nullable), so they're
      // the only role allowed to pass an explicit organizationId; without
      // one, they get an empty result rather than a system-wide search.
      const orgId = currentUser.role === "SUPER_ADMIN" ? (input.organizationId ?? "") : currentUser.organizationId ?? "";
      if (!orgId) return [];

      // 1. Search Campers
      const campers = await ctx.prisma.camper.findMany({
        where: {
          deletedAt: null,
          organizationId: orgId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: input.limit,
        include: { user: true, homeCampus: true },
      });

      // 2. Search Registrations
      const registrations = await ctx.prisma.registration.findMany({
        where: {
          deletedAt: null,
          campus: { organizationId: orgId },
          OR: [
            { registrationNumber: { contains: q, mode: "insensitive" } },
            { camper: { name: { contains: q, mode: "insensitive" } } },
            { camper: { user: { email: { contains: q, mode: "insensitive" } } } },
            { camper: { user: { firstName: { contains: q, mode: "insensitive" } } } },
            { camper: { user: { lastName: { contains: q, mode: "insensitive" } } } },
          ],
        },
        take: input.limit,
        include: { camper: { include: { user: true } }, campus: true, camp: true },
      });

      // 3. Search Staff / Users
      const users = await ctx.prisma.user.findMany({
        where: {
          deletedAt: null,
          organizationId: orgId,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: input.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          staffProfiles: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, type: true, status: true },
          },
        },
      });

      // 4. Search Campuses
      const campuses = await ctx.prisma.campus.findMany({
        where: {
          deletedAt: null,
          organizationId: orgId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { campusCode: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        take: input.limit,
      });

      const results: GlobalSearchResult[] = [];

      // Format Camper results
      for (const camper of campers) {
        const fullName = `${camper.firstName ?? ""} ${camper.lastName ?? ""}`.trim() || camper.name;
        results.push({
          id: `camper-${camper.id}`,
          type: "camper",
          title: fullName,
          subtitle: `${camper.gender ?? "Camper"} · Parent: ${camper.user?.email ?? "N/A"}`,
          badge: "Camper",
          href: `/admin/campers?openCamper=${camper.id}`,
          camperId: camper.id,
        });
      }

      // Format Registration results
      for (const reg of registrations) {
        const camperName = reg.camper
          ? `${reg.camper.firstName ?? ""} ${reg.camper.lastName ?? ""}`.trim() || reg.camper.name
          : "Camper";
        results.push({
          id: `reg-${reg.id}`,
          type: "registration",
          title: `${camperName} (${reg.registrationNumber ?? "No Reg #"})`,
          subtitle: `${reg.camp?.name ?? "Camp"} · ${reg.campus?.name ?? "Campus"} · ${reg.status}`,
          badge: "Registration",
          href: `/admin/registrations?openReg=${reg.id}`,
          registrationId: reg.id,
        });
      }

      // Format Staff / User results
      for (const user of users) {
        const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
        const staffProfile = user.staffProfiles[0];
        results.push({
          id: `user-${user.id}`,
          type: "staff",
          title: name,
          subtitle: `${user.email} · Role: ${user.role}`,
          badge: user.role === "PARENT" ? "User" : "Staff",
          href: staffProfile
            ? `/admin/${staffProfile.type === "TEACHER" ? "teachers" : "volunteers"}/${staffProfile.id}`
            : "/admin/users",
          userId: user.id,
          staffProfileId: staffProfile?.id,
        });
      }

      // Format Campus results
      for (const campus of campuses) {
        results.push({
          id: `campus-${campus.id}`,
          type: "campus",
          title: campus.name,
          subtitle: `Code: ${campus.campusCode ?? "N/A"} · ${campus.city ?? ""}`,
          badge: "Campus",
          href: `/admin/campuses?openCampus=${campus.id}`,
          campusId: campus.id,
        });
      }

      return results;
    }),
});
