import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// ProfileFieldType is not exported from @prisma/client after downgrade. Define locally to match schema.
type ProfileFieldType = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT" | "FILE";

// Schema for profile field data validation
const profileFieldSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  label: z.string().min(2, "Label must be at least 2 characters"),
  type: z.enum([
    "TEXT",
    "NUMBER",
    "DATE",
    "BOOLEAN",
    "SELECT",
    "MULTI_SELECT",
    "FILE"
  ]),
  required: z.boolean().default(false),
  options: z.string().optional(), // JSON string for select options
  organizationId: z.string(),
});

export const profileFieldRouter = createTRPCRouter({
  // Get all profile fields for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to view fields in this organization
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === input.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view profile fields for this organization" 
        });
      }
      
      // Get all profile fields for the organization
      return await ctx.prisma.profileField.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: "asc" }
      });
    }),
    
  // Get a single profile field by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      const field = await ctx.prisma.profileField.findUnique({
        where: { id: input.id }
      });
      
      if (!field) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile field not found" });
      }
      
      // Check if user has permission to view this field
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === field.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view this profile field" 
        });
      }
      
      return field;
    }),
    
  // Create a new profile field
  create: protectedProcedure
    .input(profileFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to create fields
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to create profile fields" 
        });
      }
      
      // Check if field name already exists for this organization
      const existingField = await ctx.prisma.profileField.findFirst({
        where: {
          name: input.name,
          organizationId: input.organizationId
        }
      });
      
      if (existingField) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "A field with this name already exists" 
        });
      }
      
      // Create the field
      return await ctx.prisma.profileField.create({
        data: input
      });
    }),
    
  // Update a profile field
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: profileFieldSchema.partial()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the field to update
      const field = await ctx.prisma.profileField.findUnique({
        where: { id: input.id }
      });
      
      if (!field) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile field not found" });
      }
      
      // Check if user has permission to update this field
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to update profile fields" 
        });
      }
      
      // If name is being changed, check for uniqueness
      if (input.data.name && input.data.name !== field.name) {
        const existingField = await ctx.prisma.profileField.findFirst({
          where: {
            name: input.data.name,
            organizationId: field.organizationId,
            id: { not: input.id }
          }
        });
        
        if (existingField) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "A field with this name already exists" 
          });
        }
      }
      
      // Update the field
      return await ctx.prisma.profileField.update({
        where: { id: input.id },
        data: input.data
      });
    }),
    
  // Delete a profile field
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the field to delete
      const field = await ctx.prisma.profileField.findUnique({
        where: { id: input.id }
      });
      
      if (!field) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile field not found" });
      }
      
      // Check if user has permission to delete this field
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to delete profile fields" 
        });
      }
      
      // Check if field is in use
      const fieldInUse = await ctx.prisma.profileFieldValue.findFirst({
        where: { fieldId: input.id }
      });
      
      if (fieldInUse) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Cannot delete a field that is in use" 
        });
      }
      
      // Delete the field
      return await ctx.prisma.profileField.delete({
        where: { id: input.id }
      });
    })
});
