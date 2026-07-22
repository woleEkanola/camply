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

  exportUserData: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        userType: z.enum(["ALL", "CAMPER", "TEACHER", "VOLUNTEER", "ADMIN", "PARENT"]).optional().default("ALL"),
        campusId: z.string().optional(),
        status: z.string().optional(),
        campId: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);

      const rows: Record<string, any>[] = [];

      // 1. Export Campers
      if (input.userType === "ALL" || input.userType === "CAMPER") {
        const camperWhere: any = {
          organizationId: input.organizationId,
          deletedAt: null,
        };

        if (input.campusId) {
          camperWhere.homeCampusId = input.campusId;
        }

        if (input.search?.trim()) {
          const s = input.search.trim();
          camperWhere.OR = [
            { name: { contains: s, mode: "insensitive" } },
            { user: { email: { contains: s, mode: "insensitive" } } },
            { registrations: { some: { registrationNumber: { contains: s, mode: "insensitive" } } } },
          ];
        }

        if (input.status || input.campId) {
          camperWhere.registrations = {
            some: {
              ...(input.status ? { status: input.status as any } : {}),
              ...(input.campId ? { campId: input.campId } : {}),
            },
          };
        }

        const [camperFormFields, orgCampuses] = await Promise.all([
          ctx.prisma.formField.findMany({
            where: { organizationId: input.organizationId, audience: "CAMPER", deletedAt: null },
            orderBy: { sortOrder: "asc" },
          }),
          ctx.prisma.campus.findMany({
            where: { organizationId: input.organizationId, deletedAt: null },
            select: { id: true, name: true },
          }),
        ]);
        const campusMap = new Map(orgCampuses.map((c) => [c.id, c.name]));

        const formatVal = (v: any) => {
          if (v === null || v === undefined) return "";
          const s = String(v);
          if (campusMap.has(s)) return campusMap.get(s)!;
          return s;
        };

        const campers: any[] = await ctx.prisma.camper.findMany({
          where: camperWhere,
          include: {
            user: true,
            homeCampus: true,
            registrations: {
              where: {
                ...(input.status ? { status: input.status as any } : {}),
                ...(input.campId ? { campId: input.campId } : {}),
              },
              include: {
                camp: true,
                campus: true,
                venue: true,
                tribe: true,
                room: true,
                bed: true,
              },
              orderBy: { createdAt: "desc" },
            },
            fieldValues: {
              include: {
                field: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        for (const camper of campers) {
          const reg = camper.registrations?.[0];
          const ageVal = camper.dateOfBirth
            ? Math.floor((Date.now() - new Date(camper.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null;

          const row: Record<string, any> = {
            "Record Type": "Camper",
            "Camper Name": camper.name,
            "First Name": camper.firstName || "",
            "Last Name": camper.lastName || "",
            "Preferred Name": camper.preferredName || "",
            "Date of Birth": camper.dateOfBirth ? new Date(camper.dateOfBirth).toISOString().slice(0, 10) : "",
            "Age": ageVal !== null ? ageVal : "",
            "Gender": camper.gender || "",

            // Image Links
            "Photo URL": camper.photoUrl || "",
            "Birth Certificate URL": camper.birthCert || "",
            "Parent Consent URL": reg?.parentConsent || "",

            // Contact & Address
            "Parent Name": [camper.user?.firstName, camper.user?.lastName].filter(Boolean).join(" ") || camper.user?.email || "",
            "Parent Email": camper.user?.email || "",
            "Parent Phone": camper.parentPhone || "",
            "Teen Phone": camper.teenPhone || "",
            "Street Address": camper.homeAddressStreet || "",
            "City": camper.homeAddressCity || "",
            "State": camper.homeAddressState || "",
            "Zip Code": camper.homeAddressZip || "",

            // Education & Church
            "School": camper.school || "",
            "Current Class": camper.currentClass || "",
            "Church": camper.church || "",
            "Pastor": camper.pastor || "",

            // Medical & Emergency
            "Allergies": camper.allergies || "",
            "Medical Conditions": camper.medicalConditions || "",
            "Medications": camper.medications || "",
            "Dietary Restrictions": camper.dietaryRestrictions || "",
            "Emergency Contact": camper.emergencyContactName || "",
            "Emergency Phone": camper.emergencyContactPhone || "",
            "Emergency Relationship": camper.relationship || "",

            // Registration Info
            "Registration Status": reg?.status || "NOT_REGISTERED",
            "Registration #": reg?.registrationNumber || "",
            "Camp": reg?.camp?.name || "",
            "Campus": reg?.campus?.name || camper.homeCampus?.name || "",
            "Venue": reg?.venue?.name || "",
            "Tribe": reg?.tribe?.name || "",
            "Room": reg?.room?.name || "",
            "Bed": reg?.bed?.label || "",
          };

          // Dynamically attach all configured wizard FormFields
          for (const ff of camperFormFields) {
            const fieldLabel = ff.label || ff.name;
            if (ff.source === "CUSTOM") {
              const matchedFv = camper.fieldValues?.find(
                (fv: any) => fv.fieldId === ff.id || fv.field?.name === ff.name
              );
              row[fieldLabel] = formatVal(matchedFv?.value);
            } else if (ff.systemKey) {
              // System-bound fields
              const sysVal =
                (camper as any)[ff.systemKey] ??
                (reg as any)?.[ff.systemKey] ??
                (camper.homeCampus?.name && ff.systemKey === "campusId" ? camper.homeCampus.name : null) ??
                (reg?.campus?.name && ff.systemKey === "campusId" ? reg.campus.name : null);
              row[fieldLabel] = sysVal ? formatVal(sysVal) : (row[fieldLabel] || "");
            }
          }

          // Also catch any additional custom field values not explicitly in FormField list
          if (camper.fieldValues) {
            for (const fv of camper.fieldValues) {
              const label = fv.field?.label || fv.field?.name || fv.fieldId;
              if (row[label] === undefined) {
                row[label] = formatVal(fv.value);
              }
            }
          }

          rows.push(row);
        }
      }

      // 2. Export Staff Profiles (Teachers / Volunteers)
      if (input.userType === "ALL" || input.userType === "TEACHER" || input.userType === "VOLUNTEER") {
        const staffWhere: any = {
          organizationId: input.organizationId,
          deletedAt: null,
        };

        if (input.userType === "TEACHER" || input.userType === "VOLUNTEER") {
          staffWhere.type = input.userType;
        }

        if (input.campId) {
          staffWhere.campId = input.campId;
        }

        if (input.search?.trim()) {
          const s = input.search.trim();
          staffWhere.OR = [
            { firstName: { contains: s, mode: "insensitive" } },
            { lastName: { contains: s, mode: "insensitive" } },
            { email: { contains: s, mode: "insensitive" } },
          ];
        }

        const staffProfiles: any[] = await ctx.prisma.staffProfile.findMany({
          where: staffWhere,
          include: {
            user: {
              include: {
                managedCampuses: true,
              },
            },
            assignedVenue: true,
            assignedTribe: true,
            department: true,
          },
          orderBy: { createdAt: "desc" },
        });

        for (const staff of staffProfiles) {
          const row: Record<string, any> = {
            "Record Type": staff.type === "TEACHER" ? "Teacher" : "Volunteer",
            "Camper Name": `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.email,
            "First Name": staff.firstName || "",
            "Last Name": staff.lastName || "",
            "Preferred Name": "",
            "Date of Birth": "",
            "Age": "",
            "Gender": "",

            // Image Links
            "Photo URL": staff.user?.photoUrl || "",
            "Birth Certificate URL": "",
            "Parent Consent URL": "",

            // Contact & Address
            "Parent Name": "",
            "Parent Email": staff.email,
            "Parent Phone": staff.phone || "",
            "Teen Phone": "",
            "Street Address": "",
            "City": "",
            "State": "",
            "Zip Code": "",

            // Education & Church
            "School": "",
            "Current Class": "",
            "Church": "",
            "Pastor": "",

            // Medical & Emergency
            "Allergies": "",
            "Medical Conditions": "",
            "Medications": "",
            "Dietary Restrictions": "",
            "Emergency Contact": "",
            "Emergency Phone": "",
            "Emergency Relationship": "",

            // Registration Info
            "Registration Status": staff.status,
            "Registration #": "",
            "Camp": "",
            "Campus": staff.user?.managedCampuses?.map((c: any) => c.name).join(", ") || "",
            "Venue": staff.assignedVenue?.name || "",
            "Tribe": staff.assignedTribe?.name || "",
            "Room": "",
            "Bed": "",
          };

          rows.push(row);
        }
      }

      // 3. Export Admins / Parents
      if (input.userType === "ADMIN" || input.userType === "PARENT") {
        const userWhere: any = {
          organizationId: input.organizationId,
          deletedAt: null,
        };

        if (input.userType === "ADMIN") {
          userWhere.role = { in: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"] };
        } else if (input.userType === "PARENT") {
          userWhere.role = "PARENT";
        }

        if (input.search?.trim()) {
          const s = input.search.trim();
          userWhere.OR = [
            { firstName: { contains: s, mode: "insensitive" } },
            { lastName: { contains: s, mode: "insensitive" } },
            { email: { contains: s, mode: "insensitive" } },
          ];
        }

        const users: any[] = await ctx.prisma.user.findMany({
          where: userWhere,
          include: {
            managedCampuses: true,
          },
          orderBy: { createdAt: "desc" },
        });

        for (const u of users) {
          const row: Record<string, any> = {
            "Record Type": u.role === "PARENT" ? "Parent" : "Admin",
            "Camper Name": `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
            "First Name": u.firstName || "",
            "Last Name": u.lastName || "",
            "Preferred Name": "",
            "Date of Birth": "",
            "Age": "",
            "Gender": "",

            // Image Links
            "Photo URL": u.photoUrl || "",
            "Birth Certificate URL": "",
            "Parent Consent URL": "",

            // Contact & Address
            "Parent Name": `${u.firstName || ""} ${u.lastName || ""}`.trim(),
            "Parent Email": u.email,
            "Parent Phone": u.phone || "",
            "Teen Phone": "",
            "Street Address": "",
            "City": "",
            "State": "",
            "Zip Code": "",

            // Education & Church
            "School": "",
            "Current Class": "",
            "Church": "",
            "Pastor": "",

            // Medical & Emergency
            "Allergies": "",
            "Medical Conditions": "",
            "Medications": "",
            "Dietary Restrictions": "",
            "Emergency Contact": "",
            "Emergency Phone": "",
            "Emergency Relationship": "",

            // Registration Info
            "Registration Status": u.active ? "ACTIVE" : "INACTIVE",
            "Registration #": "",
            "Camp": "",
            "Campus": u.managedCampuses?.map((c: any) => c.name).join(", ") || "",
            "Venue": "",
            "Tribe": "",
            "Room": "",
            "Bed": "",
          };

          rows.push(row);
        }
      }

      return rows;
    }),
});
