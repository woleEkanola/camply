import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// Removed unused import: UserRole

// Schema for camper profile data validation
const camperProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  userId: z.string(),
  organizationId: z.string(),
  locationId: z.string().optional(),
  active: z.boolean().default(true),
  dateOfBirth: z.string().optional(), // Accept ISO date string from client
  gender: z.string().optional(),
});

// Schema for profile field values
const profileFieldValueSchema = z.object({
  fieldId: z.string(),
  value: z.string(),
});

// Schema for camper profile update
const camperProfileUpdateSchema = z.object({
  name: z.string().optional(),
  active: z.boolean().optional(),
  locationId: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  dobApproved: z.boolean().optional(),
  birthCert: z.string().optional(),
});

export const camperProfileRouter = createTRPCRouter({
  // Get all camper profiles for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to view profiles in this organization
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === input.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view camper profiles for this organization" 
        });
      }
      
      // Get all camper profiles for the organization
      const profiles = await ctx.prisma.camperProfile.findMany({
        where: { 
          organizationId: input.organizationId,
          // If user is a location admin, only show profiles for their managed locations
          ...(currentUser.role === "LOCATION_ADMIN" && {
            location: {
              admins: {
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
          location: {
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
      // Debug log: log all fetched profiles
      console.log("DEBUG: Fetched camper profiles:", JSON.stringify(profiles, null, 2));
      // Add dobApproved and birthCert to each profile explicitly (they are scalar fields and always returned)
      return profiles.map((profile) => ({
        ...profile,
        dobApproved: profile.dobApproved ?? false,
        birthCert: profile.birthCert ?? null,
      }));
    }),
    
  // Get camper profiles for a specific user
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
          message: "Not authorized to view these camper profiles" 
        });
      }
      
      return await ctx.prisma.camperProfile.findMany({
        where: { userId: input.userId },
        include: {
          location: true,
          fieldValues: {
            include: {
              field: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
    }),
    
  // Get camper profiles for the current user (for dashboard)
  getByUserId: protectedProcedure
    .query(async ({ ctx }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      return await ctx.prisma.camperProfile.findMany({
        where: { userId: currentUser.id },
        include: {
          organization: true,
          location: true,
          registrations: {
            include: {
              year: true,
              location: true
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
    
  // Get a single camper profile by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          active: true,
          dateOfBirth: true,
          birthCert:true,
          gender: true,
          user: true,
          location: true,
          locationId: true,
          organizationId: true,
          fieldValues: {
            include: {
              field: true
            }
          }
        }
      });
      
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }
      
      // Check if user has permission to view this profile
      const hasPermission = 
        currentUser.id === profile.user?.id || 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && 
         profile.locationId && 
         await ctx.prisma.location.findFirst({
           where: {
             id: profile.locationId,
             admins: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view this camper profile" 
        });
      }
      
      return profile;
    }),
    
  // Create a new camper profile
  create: protectedProcedure
    .input(z.object({
      profile: camperProfileSchema,
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
          message: "Not authorized to create camper profiles" 
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
        const settings = org.settings || {};
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
      const profile = await ctx.prisma.camperProfile.create({
        data: {
          name: input.profile.name,
          active: input.profile.active,
          user: { connect: { id: input.profile.userId } },
          organization: { connect: { id: input.profile.organizationId } },
          ...(input.profile.locationId && {
            location: { connect: { id: input.profile.locationId } }
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
                camperProfile: { connect: { id: profile.id } }
              }
            })
          )
        );
      }
      
      return profile;
    }),
    
  // Create a new camper profile during signup (public procedure)
  createDuringSignup: publicProcedure
    .input(z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      userId: z.string(),
      organizationId: z.string(),
      locationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Create the camper profile
        const profile = await ctx.prisma.camperProfile.create({
          data: {
            name: input.name,
            user: { connect: { id: input.userId } },
            organization: { connect: { id: input.organizationId } },
            location: { connect: { id: input.locationId } },
            active: true
          }
        });
        
        return profile;
      } catch (error) {
        const err = error as Error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error creating camper profile: ${err.message}`
        });
      }
    }),
    
  // Update a camper profile
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      profile: camperProfileUpdateSchema,
      fieldValues: z.array(profileFieldValueSchema).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the profile to update
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.id },
        include: { fieldValues: true, user: true, location: true }
      });
      
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }
      
      // Check if user has permission to update this profile
      const hasPermission = 
        currentUser.id === profile.user?.id || 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (
          currentUser.role === "LOCATION_ADMIN" &&
          profile.locationId &&
          await ctx.prisma.location.findFirst({
            where: {
              id: profile.locationId,
              admins: { some: { id: currentUser.id } },
            },
          })
        );
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to update this camper profile" 
        });
      }
      
      // Update the profile
      const updatedProfile = await ctx.prisma.camperProfile.update({
        where: { id: input.id },
        data: {
          ...(input.profile.name && { name: input.profile.name }),
          ...(input.profile.active !== undefined && { active: input.profile.active }),
          ...(input.profile.locationId && { 
            location: { connect: { id: input.profile.locationId } }
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
          ...(input.profile.birthCert && { birthCert: input.profile.birthCert }),
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
                  camperProfile: { connect: { id: input.id } }
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
      
      // Only admins or location admins can approve DOB
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.id },
        include: { location: true },
      });
      
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }
      
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" &&
          profile.locationId &&
          (await ctx.prisma.location.findFirst({
            where: {
              id: profile.locationId,
              admins: { some: { id: currentUser.id } },
            },
          })));
      
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to approve DOB" });
      }
      
      return await ctx.prisma.camperProfile.update({
        where: { id: input.id },
        data: { dobApproved: input.dobApproved },
      });
    }),
    
  // Delete a camper profile
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the profile to delete
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.id },
        select: { userId: true }
      });
      
      if (!profile) {
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
          message: "Not authorized to delete this camper profile" 
        });
      }
      
      // Delete the profile (will cascade delete field values)
      return await ctx.prisma.camperProfile.delete({
        where: { id: input.id }
      });
    })
});
