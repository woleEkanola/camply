import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { logEvent } from "../../audit";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";
import { flagDocumentRequiresAction } from "../../registration/engine";

export const documentRouter = createTRPCRouter({
  listForRegistration: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { camper: true, campus: true },
      });

      const isOwner = registration.camper.userId === currentUser.id;
      if (!isOwner) {
        // Re-derives the campus a rep is actually scoped to, rather than
        // trusting the LOCATION_ADMIN/CAMPUS_REPRESENTATIVE role alone
        // (previously a real cross-campus authorization gap).
        await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      }

      const [camperDocs, regDocs] = await Promise.all([
        ctx.prisma.document.findMany({
          where: { camperId: registration.camperId, deletedAt: null },
          include: { documentActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        }),
        ctx.prisma.document.findMany({
          where: { registrationId: registration.id, deletedAt: null },
          include: { documentActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        }),
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
        include: { camper: true, campus: true },
      });

      const isOwner = registration.camper.userId === currentUser.id;
      let isAuthorized = isOwner;
      if (!isOwner) {
        try {
          await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
          isAuthorized = true;
        } catch {
          isAuthorized = false;
        }
      }
      if (!isAuthorized) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const requirement = await ctx.prisma.documentRequirement.findUniqueOrThrow({ where: { id: input.requirementId } });

      // Server-side validation: file size
      const maxBytes = requirement.maxSizeMb * 1024 * 1024;
      if (input.fileSize > maxBytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File exceeds the maximum size of ${requirement.maxSizeMb} MB.`,
        });
      }

      // Server-side validation: accepted formats
      const acceptedFormatsList = (requirement.acceptedFormats as string)
        .split(",")
        .map((f: string) => f.trim().toLowerCase());
      const ext = input.fileName.split(".").pop()?.toLowerCase();
      if (ext && acceptedFormatsList.length > 0 && !acceptedFormatsList.includes(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Accepted formats: ${acceptedFormatsList.join(", ")}.`,
        });
      }

      const document = await ctx.prisma.document.create({
        data: {
          requirementId: requirement.id,
          camperId: requirement.scope === "CAMPER" ? registration.camperId : null,
          registrationId: requirement.scope === "REGISTRATION" ? registration.id : null,
          url: input.url,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          uploadedById: currentUser.id,
        },
      });

      await logEvent(ctx.prisma, {
        organizationId: registration.camper.organizationId,
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

      const doc = await ctx.prisma.document.findUniqueOrThrow({
        where: { id: input.id },
        include: { camper: true, registration: { include: { camper: true } } },
      });
      if (doc.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

      const isUploader = doc.uploadedById === currentUser.id;
      if (!isUploader) {
        if (!["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        // Admins may only delete documents within their own organization —
        // the role check alone let an admin delete any document by id across
        // tenants.
        const docOrgId = doc.camper?.organizationId ?? doc.registration?.camper.organizationId;
        if (currentUser.role !== "SUPER_ADMIN" && docOrgId !== currentUser.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      return ctx.prisma.document.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  // Admin document review (PRD Part 5 §8, Part 9 §12)
  review: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const doc = await ctx.prisma.document.findUniqueOrThrow({
        where: { id: input.id },
        include: { camper: true },
      });

      if (doc.registrationId) {
        const registration = await ctx.prisma.registration.findUniqueOrThrow({
          where: { id: doc.registrationId },
          include: { campus: true },
        });
        // Re-derives the campus a rep is actually scoped to, rather than
        // trusting the LOCATION_ADMIN/CAMPUS_REPRESENTATIVE role alone
        // (previously a real cross-campus authorization gap).
        await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      } else {
        // Camper-scoped documents have no registration/campus context to
        // scope a rep by - restrict review to org admins, and only within the
        // camper's own organization (the role check alone let an admin review
        // camper documents across tenants).
        if (!["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (currentUser.role !== "SUPER_ADMIN" && doc.camper?.organizationId !== currentUser.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const updated = await ctx.prisma.document.update({
        where: { id: input.id },
        data: { status: input.status, rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null },
      });

      if (updated.registrationId) {
        const registration = await ctx.prisma.registration.findUnique({ where: { id: updated.registrationId }, include: { camper: true } });
        if (registration) {
          await logEvent(ctx.prisma, {
            organizationId: registration.camper.organizationId,
            registrationId: registration.id,
            actorId: currentUser.id,
            action: input.status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
            newValue: { documentId: updated.id, reason: input.rejectionReason },
          });
        }
      }

      return updated;
    }),

  flagRequiresAction: protectedProcedure
    .input(z.object({ documentId: z.string(), registrationId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });

      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);

      return flagDocumentRequiresAction({
        documentId: input.documentId,
        registrationId: input.registrationId,
        actorId: currentUser.id,
        reason: input.reason,
      });
    }),

  replaceForRegistration: protectedProcedure
    .input(z.object({
      requirementId: z.string(),
      registrationId: z.string(),
      url: z.string(),
      fileName: z.string(),
      fileType: z.string(),
      fileSize: z.number(),
      replacingDocumentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { camper: true, campus: true },
      });

      const isOwner = registration.camper.userId === currentUser.id;
      let isAuthorized = isOwner;
      if (!isOwner) {
        try {
          await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
          isAuthorized = true;
        } catch {
          isAuthorized = false;
        }
      }
      if (!isAuthorized) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const requirement = await ctx.prisma.documentRequirement.findUniqueOrThrow({ where: { id: input.requirementId } });

      // Server-side validation: file size
      const maxBytes = requirement.maxSizeMb * 1024 * 1024;
      if (input.fileSize > maxBytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File exceeds the maximum size of ${requirement.maxSizeMb} MB.`,
        });
      }

      // Server-side validation: accepted formats
      const acceptedFormatsList = (requirement.acceptedFormats as string)
        .split(",")
        .map((f: string) => f.trim().toLowerCase());
      const ext = input.fileName.split(".").pop()?.toLowerCase();
      if (ext && acceptedFormatsList.length > 0 && !acceptedFormatsList.includes(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Accepted formats: ${acceptedFormatsList.join(", ")}.`,
        });
      }

      const oldDocument = await ctx.prisma.document.findUniqueOrThrow({
        where: { id: input.replacingDocumentId },
        include: { documentActions: { where: { status: "REQUIRES_ACTION" } } },
      });
      if (oldDocument.registrationId !== registration.id || oldDocument.requirementId !== requirement.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Document to replace does not match this registration/requirement." });
      }

      const newDocument = await ctx.prisma.document.create({
        data: {
          requirementId: requirement.id,
          camperId: requirement.scope === "CAMPER" ? registration.camperId : null,
          registrationId: requirement.scope === "REGISTRATION" ? registration.id : null,
          url: input.url,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          uploadedById: currentUser.id,
        },
      });

      await ctx.prisma.document.update({ where: { id: oldDocument.id }, data: { deletedAt: new Date() } });

      const activeAction = oldDocument.documentActions[0];
      if (activeAction) {
        const resolutionType = isOwner ? "PARENT_UPLOAD" : "REP_UPLOAD";
        await ctx.prisma.documentAction.update({
          where: { id: activeAction.id },
          data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: currentUser.id, resolutionType },
        });
      }

      await logEvent(ctx.prisma, {
        organizationId: registration.camper.organizationId,
        registrationId: registration.id,
        actorId: currentUser.id,
        action: "DOCUMENT_REPLACED",
        previousValue: { documentId: oldDocument.id },
        newValue: { documentId: newDocument.id, requirement: requirement.name, replacementForId: oldDocument.id },
      });

      return newDocument;
    }),
});
