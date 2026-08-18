import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCommand, assertOrgAdminOrCampusRep as assertScopedOrgAccess } from "../trpc/scoping";
import { evaluateMedicalText, PROTECTED_SHORT_TERMS } from "../../../lib/medicalCleaner";
import { logEvent } from "../../audit";

const assertOrgAdmin = (ctx: any, organizationId: string) =>
  assertOrgAdminOrCommand(ctx, organizationId, "REGISTRATION");

const assertOrgAdminOrCampusRep = (ctx: any, organizationId: string, campusId?: string | null) =>
  assertScopedOrgAccess(ctx, organizationId, campusId, "REGISTRATION");

export const medicalCleanRouter = createTRPCRouter({
  // ─── Preview Bulk Cleanup ───────────────────────────────────────────────
  previewBulkCleanup: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        campId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const [campers, staffList] = await Promise.all([
        ctx.prisma.camper.findMany({
          where: {
            organizationId: input.organizationId,
            ...(input.campId
              ? {
                  registrations: {
                    some: {
                      campId: input.campId,
                      deletedAt: null,
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            allergies: true,
            medicalConditions: true,
            medications: true,
            dietaryRestrictions: true,
          },
        }),
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            deletedAt: null,
            ...(input.campId ? { campId: input.campId } : {}),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            type: true,
            allergies: true,
            medicalConditions: true,
          },
        }),
      ]);

      const candidates: Array<{
        id: string; // camper or staffProfile id
        name: string;
        role: "CAMPER" | "TEACHER" | "VOLUNTEER";
        model: "CAMPER" | "STAFF";
        field: "allergies" | "medicalConditions" | "medications" | "dietaryRestrictions";
        fieldLabel: string;
        originalValue: string;
        reason: string;
      }> = [];

      const preservedHighlights: Array<{
        id: string;
        name: string;
        role: "CAMPER" | "TEACHER" | "VOLUNTEER";
        field: "allergies" | "medicalConditions" | "medications" | "dietaryRestrictions";
        fieldLabel: string;
        value: string;
        reason: string;
        isShortTermProtected: boolean;
      }> = [];

      let totalAnalyzed = 0;
      let validConditionsCount = 0;
      let shortTermsProtectedCount = 0;

      // 1. Process Campers
      for (const camper of campers) {
        totalAnalyzed++;
        const fieldsToCheck: Array<["allergies" | "medicalConditions" | "medications" | "dietaryRestrictions", string | null]> = [
          ["allergies", camper.allergies],
          ["medicalConditions", camper.medicalConditions],
          ["medications", camper.medications],
          ["dietaryRestrictions", camper.dietaryRestrictions],
        ];

        for (const [fieldName, val] of fieldsToCheck) {
          if (!val || val.trim().length === 0) continue;
          const evaluation = evaluateMedicalText(val);

          const fieldLabel =
            fieldName === "allergies"
              ? "Allergies"
              : fieldName === "medicalConditions"
              ? "Medical Conditions"
              : fieldName === "medications"
              ? "Medications"
              : "Dietary Restrictions";

          if (evaluation.action === "CLEAN_TO_NULL") {
            candidates.push({
              id: camper.id,
              name: camper.name,
              role: "CAMPER",
              model: "CAMPER",
              field: fieldName,
              fieldLabel,
              originalValue: val,
              reason: evaluation.reason,
            });
          } else {
            validConditionsCount++;
            if (evaluation.isShortTermProtected) {
              shortTermsProtectedCount++;
            }
            preservedHighlights.push({
              id: camper.id,
              name: camper.name,
              role: "CAMPER",
              field: fieldName,
              fieldLabel,
              value: val,
              reason: evaluation.reason,
              isShortTermProtected: evaluation.isShortTermProtected,
            });
          }
        }
      }

      // 2. Process Staff
      for (const staff of staffList) {
        totalAnalyzed++;
        const staffName = `${staff.firstName} ${staff.lastName}`.trim();
        const role = staff.type === "TEACHER" ? "TEACHER" : "VOLUNTEER";
        const fieldsToCheck: Array<["allergies" | "medicalConditions", string | null]> = [
          ["allergies", staff.allergies],
          ["medicalConditions", staff.medicalConditions],
        ];

        for (const [fieldName, val] of fieldsToCheck) {
          if (!val || val.trim().length === 0) continue;
          const evaluation = evaluateMedicalText(val);

          const fieldLabel = fieldName === "allergies" ? "Allergies" : "Medical Conditions";

          if (evaluation.action === "CLEAN_TO_NULL") {
            candidates.push({
              id: staff.id,
              name: staffName,
              role,
              model: "STAFF",
              field: fieldName,
              fieldLabel,
              originalValue: val,
              reason: evaluation.reason,
            });
          } else {
            validConditionsCount++;
            if (evaluation.isShortTermProtected) {
              shortTermsProtectedCount++;
            }
            preservedHighlights.push({
              id: staff.id,
              name: staffName,
              role,
              field: fieldName,
              fieldLabel,
              value: val,
              reason: evaluation.reason,
              isShortTermProtected: evaluation.isShortTermProtected,
            });
          }
        }
      }

      return {
        summary: {
          totalAnalyzed,
          placeholderCount: candidates.length,
          validConditionsCount,
          shortTermsProtectedCount,
        },
        candidates,
        preservedHighlights,
      };
    }),

  // ─── Execute Bulk Cleanup ───────────────────────────────────────────────
  executeBulkCleanup: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        items: z.array(
          z.object({
            id: z.string(),
            model: z.enum(["CAMPER", "STAFF"]),
            field: z.enum(["allergies", "medicalConditions", "medications", "dietaryRestrictions"]),
            originalValue: z.string().optional(),
          })
        ).min(1, "Select at least one item to clean"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);

      const camperUpdates: Array<{ id: string; field: string }> = [];
      const staffUpdates: Array<{ id: string; field: string }> = [];

      for (const item of input.items) {
        if (item.model === "CAMPER") {
          camperUpdates.push({ id: item.id, field: item.field });
        } else {
          staffUpdates.push({ id: item.id, field: item.field });
        }
      }

      const result = await ctx.prisma.$transaction(async (tx: any) => {
        let cleanedCount = 0;

        // Group camper updates by ID
        const camperMap = new Map<string, Record<string, null>>();
        for (const u of camperUpdates) {
          const current = camperMap.get(u.id) || {};
          current[u.field] = null;
          camperMap.set(u.id, current);
        }

        for (const [id, data] of camperMap.entries()) {
          await tx.camper.update({
            where: { id },
            data,
          });
          cleanedCount += Object.keys(data).length;
        }

        // Group staff updates by ID
        const staffMap = new Map<string, Record<string, null>>();
        for (const u of staffUpdates) {
          const current = staffMap.get(u.id) || {};
          current[u.field] = null;
          staffMap.set(u.id, current);
        }

        for (const [id, data] of staffMap.entries()) {
          await tx.staffProfile.update({
            where: { id },
            data,
          });
          cleanedCount += Object.keys(data).length;
        }

        await logEvent(tx, {
          organizationId: input.organizationId,
          actorId: ctx.userId,
          action: "MEDICAL_DATA_BULK_CLEANED",
          newValue: {
            cleanedFieldsCount: cleanedCount,
            totalItems: input.items.length,
          },
        });

        return { cleanedCount };
      });

      return {
        success: true,
        cleanedCount: result.cleanedCount,
      };
    }),
});
