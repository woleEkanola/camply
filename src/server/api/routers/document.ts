import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { logEvent } from "../../audit";

export const documentRouter = createTRPCRouter({
  listForRegistration: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { camperProfile: true },
      });

      const isOwner = registration.camperProfile.userId === currentUser.id;
      const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      if (!isOwner && !isAdmin && currentUser.role !== "LOCATION_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [camperDocs, regDocs] = await Promise.all([
        ctx.prisma.document.findMany({ where: { camperProfileId: registration.camperProfileId } }),
        ctx.prisma.document.findMany({ where: { registrationId: registration.id } }),
      ]);
      return [...camperDocs, ...regDocs];
    }),

  upload: protectedProcedure
    .input(z.object({
      requirementId: z.string(),
      registrationId: z.string(),
      url: z.string(),
      fileName: z.string(),
      fileType: z.string(),
      fileSize: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { camperProfile: true },
      });
      if (registration.camperProfile.userId !== currentUser.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const requirement = await ctx.prisma.documentRequirement.findUniqueOrThrow({ where: { id: input.requirementId } });

      const document = await ctx.prisma.document.create({
        data: {
          requirementId: requirement.id,
          camperProfileId: requirement.scope === "CAMPER" ? registration.camperProfileId : null,
          registrationId: requirement.scope === "REGISTRATION" ? registration.id : null,
          url: input.url,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          uploadedById: currentUser.id,
        },
      });

      await logEvent(ctx.prisma, {
        organizationId: registration.camperProfile.organizationId,
        registrationId: registration.id,
        actorId: currentUser.id,
        action: "DOCUMENT_UPLOADED",
        newValue: { documentId: document.id, requirement: requirement.name },
      });

      return document;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const doc = await ctx.prisma.document.findUniqueOrThrow({ where: { id: input.id } });
      if (doc.uploadedById !== currentUser.id && !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.document.delete({ where: { id: input.id } });
    }),

  // Admin document review (PRD Part 5 §8, Part 9 §12)
  review: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const doc = await ctx.prisma.document.update({
        where: { id: input.id },
        data: { status: input.status, rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null },
      });

      if (doc.registrationId) {
        const registration = await ctx.prisma.registration.findUnique({ where: { id: doc.registrationId }, include: { camperProfile: true } });
        if (registration) {
          await logEvent(ctx.prisma, {
            organizationId: registration.camperProfile.organizationId,
            registrationId: registration.id,
            actorId: currentUser.id,
            action: input.status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
            newValue: { documentId: doc.id, reason: input.rejectionReason },
          });
        }
      }

      return doc;
    }),
});
