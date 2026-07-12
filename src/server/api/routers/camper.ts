import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// Define organization settings type
type OrganizationSettings = {
  minAge?: number;
  maxAge?: number;
  cutoffDate?: string;
};

// Removed unused import: UserRole

// Schema for camper data validation
const camperSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  userId: z.string(),
  organizationId: z.string(),
  homeCampusId: z.string().optional(),
  active: z.boolean().default(true),
  dateOfBirth: z.string().optional(), // Accept ISO date string from client
  gender: z.string().optional(),
});

// Schema for profile field values
const profileFieldValueSchema = z.object({
  fieldId: z.string(),
  value: z.string(),
});

// Schema for camper update
const camperUpdateSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  active: z.boolean().optional(),
  homeCampusId: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  dobApproved: z.boolean().optional(),
  birthCert: z.string().optional(),
});

export const camperRouter = createTRPCRouter({
  // Get campers for an organization with pagination, filtering and registration status
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to view profiles in this organization
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      const hasPermission =
        isOrgAdmin ||
        ((currentUser.managedCampuses?.length ?? 0) > 0 && currentUser.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view campers for this organization"
        });
      }

      // Get all campers for the organization
      const profiles = await ctx.prisma.camper.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          // If user is a campus rep (any role) and not also an org admin, only
          // show profiles for their managed campuses — org admins always see all.
          ...(!isOrgAdmin && (currentUser.managedCampuses?.length ?? 0) > 0 && {
            homeCampus: {
              reps: {
                some: {
                  id: currentUser.id
                }
              }
            }
          })
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            }
          },
          homeCampus: {
            select: {
              id: true,
              name: true,
            }
          },
          fieldValues: {
            include: {
              field: true
            }
          },
        },
        orderBy: { createdAt: "desc" }
      });
      // Add dobApproved and birthCert to each profile explicitly (they are scalar fields and always returned)
      return profiles.map((profile) => ({
        ...profile,
        dobApproved: profile.dobApproved ?? false,
        birthCert: profile.birthCert ?? null,
      }));
    }),

  adminList: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional(),
      q: z.string().optional(),
      campusId: z.string().optional(),
      active: z.boolean().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to view profiles in this organization
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      const hasPermission =
        isOrgAdmin ||
        ((currentUser.managedCampuses?.length ?? 0) > 0 && currentUser.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view campers for this organization"
        });
      }

      const where: Record<string, any> = {
        organizationId: input.organizationId,
        deletedAt: null,
        ...(input.campusId && { homeCampusId: input.campusId }),
        ...(input.active !== undefined && { active: input.active }),
        ...(input.status && {
          registrations: {
            some: {
              deletedAt: null,
              status: input.status,
              ...(input.campId && { campId: input.campId }),
            },
          },
        }),
        ...(input.q && {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { user: { email: { contains: input.q, mode: "insensitive" } } },
            { user: { firstName: { contains: input.q, mode: "insensitive" } } },
            { user: { lastName: { contains: input.q, mode: "insensitive" } } },
          ],
        }),
        // Scoped views for campus reps
        ...(!isOrgAdmin && (currentUser.managedCampuses?.length ?? 0) > 0 && {
          homeCampus: {
            reps: {
              some: {
                id: currentUser.id
              }
            }
          }
        })
      };

      const items = await ctx.prisma.camper.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            }
          },
          homeCampus: {
            select: {
              id: true,
              name: true,
            }
          },
          registrations: {
            where: {
              deletedAt: null,
              ...(input.campId && { campId: input.campId }),
            },
            select: {
              status: true,
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      const mappedItems = items.map((profile: any) => ({
        ...profile,
        dobApproved: profile.dobApproved ?? false,
        birthCert: profile.birthCert ?? null,
      }));

      return { items: mappedItems, nextCursor };
    }),

  // Get campers for a specific user
  getByUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Users can view their own profiles, admins can view any profiles
      const hasPermission =
        currentUser.id === input.userId ||
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view these campers"
        });
      }

      return await ctx.prisma.camper.findMany({
        where: { userId: input.userId, deletedAt: null },
        include: {
          homeCampus: true,
          fieldValues: {
            include: {
              field: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
    }),

  // Get campers for the current user (for dashboard)
  getByUserId: protectedProcedure
    .query(async ({ ctx }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      return await ctx.prisma.camper.findMany({
        where: { userId: currentUser.id, deletedAt: null },
        include: {
          organization: true,
          homeCampus: true,
          registrations: {
            where: { deletedAt: null },
            include: {
              camp: true,
              campus: true
            }
          },
          fieldValues: {
            include: {
              field: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
    }),

  // Get a single camper by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.id },
        include: {
          user: true,
          homeCampus: true,
          fieldValues: {
            include: {
              field: true
            }
          }
        }
      });

      if (!profile || profile.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }

      // Check if user has permission to view this profile
      const hasPermission =
        currentUser.id === profile.user?.id ||
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(profile.homeCampusId &&
         await ctx.prisma.campus.findFirst({
           where: {
             id: profile.homeCampusId,
             reps: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this camper"
        });
      }

      return profile;
    }),

  // Create a new camper
  create: protectedProcedure
    .input(z.object({
      profile: camperSchema,
      fieldValues: z.array(profileFieldValueSchema)
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to create profiles
      // Users can create their own profiles, admins can create for anyone
      const hasPermission =
        currentUser.id === input.profile.userId ||
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to create campers"
        });
      }

      // Validate DOB against organization settings
      if (input.profile.dateOfBirth) {
        const org = await ctx.prisma.organization.findUnique({
          where: { id: input.profile.organizationId },
          select: { settings: true }
        });
        if (!org) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
        }
        // Parse settings from JSON
        const settings = org.settings ? JSON.parse(JSON.stringify(org.settings)) : {};
        const minAge = typeof settings.minAge === 'number' ? settings.minAge : 5;
        const maxAge = typeof settings.maxAge === 'number' ? settings.maxAge : 18;
        const dob = new Date(input.profile.dateOfBirth);
        const now = new Date();
        // Use current local time provided by system
        const currentYear = 2025;
        const currentMonth = 5;
        const currentDay = 8;
        const today = new Date(currentYear, currentMonth - 1, currentDay);
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        if (age < minAge || age > maxAge) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Camper age (${age}) is outside the allowed range (${minAge}-${maxAge}) for this organization.`
          });
        }
      }
      // Create the profile
      const profile = await ctx.prisma.camper.create({
        data: {
          name: input.profile.name,
          firstName: input.profile.firstName,
          middleName: input.profile.middleName,
          lastName: input.profile.lastName,
          active: input.profile.active,
          user: { connect: { id: input.profile.userId } },
          organization: { connect: { id: input.profile.organizationId } },
          ...(input.profile.homeCampusId && {
            homeCampus: { connect: { id: input.profile.homeCampusId } }
          }),
          ...(input.profile.dateOfBirth && {
            dateOfBirth: new Date(input.profile.dateOfBirth)
          }),
          ...(input.profile.gender && {
            gender: input.profile.gender
          })
        }
      });

      // Create field values
      if (input.fieldValues.length > 0) {
        await Promise.all(
          input.fieldValues.map(fieldValue =>
            ctx.prisma.profileFieldValue.create({
              data: {
                value: fieldValue.value,
                field: { connect: { id: fieldValue.fieldId } },
                camper: { connect: { id: profile.id } }
              }
            })
          )
        );
      }

      return profile;
    }),

  // Update a camper
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      profile: camperUpdateSchema,
      fieldValues: z.array(profileFieldValueSchema).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the profile to update
      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.id },
        include: { fieldValues: true, user: true, homeCampus: true }
      });

      if (!profile || profile.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }

      // Check if user has permission to update this profile
      const hasPermission =
        currentUser.id === profile.user?.id ||
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(
          profile.homeCampusId &&
          await ctx.prisma.campus.findFirst({
            where: {
              id: profile.homeCampusId,
              reps: { some: { id: currentUser.id } },
            },
          })
        );

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this camper"
        });
      }

      // Update the profile
      const updatedProfile = await ctx.prisma.camper.update({
        where: { id: input.id },
        data: {
          ...(input.profile.name && { name: input.profile.name }),
          ...(input.profile.firstName !== undefined && { firstName: input.profile.firstName }),
          ...(input.profile.middleName !== undefined && { middleName: input.profile.middleName }),
          ...(input.profile.lastName !== undefined && { lastName: input.profile.lastName }),
          ...(input.profile.active !== undefined && { active: input.profile.active }),
          ...(input.profile.homeCampusId && {
            homeCampus: { connect: { id: input.profile.homeCampusId } }
          }),
          ...(input.profile.dateOfBirth && {
            dateOfBirth: new Date(input.profile.dateOfBirth)
          }),
          ...(input.profile.gender && {
            gender: input.profile.gender
          }),
          ...(input.profile.dobApproved !== undefined && {
            dobApproved: input.profile.dobApproved
          }),
          ...(input.profile.birthCert !== undefined && { birthCert: input.profile.birthCert }),
        }
      });

      // Update field values if provided
      if (input.fieldValues && input.fieldValues.length > 0) {
        // Get current field values
        const currentFieldValues = profile.fieldValues;

        // Process each field value
        await Promise.all(
          input.fieldValues.map(async (fieldValue: any) => {
            const existingValue = currentFieldValues.find((v: any) => v.fieldId === fieldValue.fieldId);

            if (existingValue) {
              // Update existing value
              await ctx.prisma.profileFieldValue.update({
                where: { id: existingValue.id },
                data: { value: fieldValue.value }
              });
            } else {
              // Create new value
              await ctx.prisma.profileFieldValue.create({
                data: {
                  value: fieldValue.value,
                  field: { connect: { id: fieldValue.fieldId } },
                  camper: { connect: { id: input.id } }
                }
              });
            }
          })
        );
      }

      return updatedProfile;
    }),

  // Update DOB approval
  updateDobApproval: protectedProcedure
    .input(z.object({ id: z.string(), dobApproved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Only admins or campus reps can approve DOB
      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.id },
        include: { homeCampus: true },
      });

      if (!profile || profile.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }

      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(profile.homeCampusId &&
          (await ctx.prisma.campus.findFirst({
            where: {
              id: profile.homeCampusId,
              reps: { some: { id: currentUser.id } },
            },
          })));

      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to approve DOB" });
      }

      return await ctx.prisma.camper.update({
        where: { id: input.id },
        data: { dobApproved: input.dobApproved },
      });
    }),

  // Delete a camper (soft delete — recoverable from Trash for 60 days; cascades
  // to this camper's Registrations, matching the previous hard-delete's cascade behavior)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the profile to delete
      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.id },
        select: { userId: true, deletedAt: true }
      });

      if (!profile || profile.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }

      // Check if user has permission to delete this profile
      const hasPermission =
        currentUser.id === profile.userId ||
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this camper"
        });
      }

      const now = new Date();
      return ctx.prisma.$transaction(async (tx) => {
        await tx.registration.updateMany({ where: { camperId: input.id, deletedAt: null }, data: { deletedAt: now } });
        return tx.camper.update({ where: { id: input.id }, data: { deletedAt: now } });
      }, { timeout: 15000 });
    })
});
