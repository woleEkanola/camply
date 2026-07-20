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

      const orgId = input.organizationId || currentUser.organizationId || "";

      // 1. Search Campers
      const campers = await ctx.prisma.camper.findMany({
        where: {
          deletedAt: null,
          ...(orgId ? { organizationId: orgId } : {}),
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
          ...(orgId ? { campus: { organizationId: orgId } } : {}),
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
          ...(orgId ? { organizationId: orgId } : {}),
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: input.limit,
      });

      // 4. Search Campuses
      const campuses = await ctx.prisma.campus.findMany({
        where: {
          deletedAt: null,
          ...(orgId ? { organizationId: orgId } : {}),
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
        results.push({
          id: `user-${user.id}`,
          type: "staff",
          title: name,
          subtitle: `${user.email} · Role: ${user.role}`,
          badge: user.role === "PARENT" ? "User" : "Staff",
          href: `/admin/staff?openStaff=${user.id}`,
          userId: user.id,
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
