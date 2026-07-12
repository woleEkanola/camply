import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { assertOrgAdmin } from "../trpc/scoping";
import { importBundleSchema } from "../../../lib/import-export/schemas";
import type { CampusRow, DepartmentRow, TribeRow } from "../../../lib/import-export/types";
import { importCampuses, importDepartments, importTribes } from "../../importExport/importer";

export const importExportRouter = createTRPCRouter({
  export: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);

      const org = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });

      const campuses = await ctx.prisma.campus.findMany({
        where: { organizationId: input.organizationId, deletedAt: null },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });

      const tribes = org.activeCampId
        ? await ctx.prisma.tribe.findMany({
            where: { campId: org.activeCampId, deletedAt: null },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          })
        : [];

      const departments = await ctx.prisma.department.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          OR: [{ campId: null }, ...(org.activeCampId ? [{ campId: org.activeCampId }] : [])],
        },
        orderBy: { name: "asc" },
      });

      const campusRows: CampusRow[] = campuses.map((c) => ({
        name: c.name,
        address: c.address,
        city: c.city,
        country: c.country,
        state: c.state ?? undefined,
        zipCode: c.zipCode ?? undefined,
        pastor: c.pastor ?? undefined,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
        campusCode: c.campusCode ?? undefined,
        active: c.active,
        signupOpen: c.signupOpen,
        displayOrder: c.displayOrder,
      }));

      const tribeRows: TribeRow[] = tribes.map((t) => ({
        name: t.name,
        code: t.code ?? undefined,
        color: t.color ?? undefined,
        description: t.description ?? undefined,
        meaning: t.meaning ?? undefined,
        motto: t.motto ?? undefined,
        scripture: t.scripture ?? undefined,
        gender: (t.gender as TribeRow["gender"]) ?? undefined,
        ageRange: t.ageRange ?? undefined,
        maxCapacity: t.maxCapacity ?? undefined,
        allocationStrategy: t.allocationStrategy as TribeRow["allocationStrategy"],
        displayOrder: t.displayOrder,
        logoUrl: t.logoUrl ?? undefined,
        bannerUrl: t.bannerUrl ?? undefined,
      }));

      const departmentRows: DepartmentRow[] = departments.map((d) => ({
        name: d.name,
        description: d.description ?? undefined,
        maxCapacity: d.maxCapacity ?? undefined,
        responsibilities: d.responsibilities.length ? d.responsibilities : undefined,
        status: d.status as DepartmentRow["status"],
        campScoped: d.campId != null,
      }));

      return { campuses: campusRows, tribes: tribeRows, departments: departmentRows };
    }),

  import: protectedProcedure
    .input(z.object({ organizationId: z.string(), bundle: importBundleSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);

      const org = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });

      if (input.bundle.tribes?.length && !org.activeCampId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Set an active camp before importing tribes",
        });
      }

      const results: {
        campuses?: Awaited<ReturnType<typeof importCampuses>>;
        tribes?: Awaited<ReturnType<typeof importTribes>>;
        departments?: Awaited<ReturnType<typeof importDepartments>>;
      } = {};

      if (input.bundle.campuses?.length) {
        results.campuses = await importCampuses(ctx.prisma, input.organizationId, input.bundle.campuses);
      }
      if (input.bundle.tribes?.length) {
        results.tribes = await importTribes(ctx.prisma, org.activeCampId!, input.bundle.tribes);
      }
      if (input.bundle.departments?.length) {
        results.departments = await importDepartments(
          ctx.prisma,
          input.organizationId,
          org.activeCampId,
          input.bundle.departments
        );
      }

      return results;
    }),
});
