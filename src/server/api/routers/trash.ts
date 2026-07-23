import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { listTrash, restoreEntity, purgeEntity } from "../../trash/service";
import { assertOrgAdmin } from "../trpc/scoping";

const entityTypeSchema = z.enum([
  "campus",
  "venue",
  "camp",
  "camper",
  "registration",
  "hostel",
  "room",
  "bed",
  "tribe",
  "department",
  "staffProfile",
  "formField",
  "document",
  "documentRequirement",
  "user",
]);

export const trashRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input?.organizationId);
      return listTrash(input?.organizationId);
    }),

  restore: protectedProcedure
    .input(z.object({ organizationId: z.string().optional(), type: entityTypeSchema, id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      return restoreEntity(input.type, input.id, input.organizationId);
    }),

  purgeNow: protectedProcedure
    .input(z.object({ organizationId: z.string().optional(), type: entityTypeSchema, id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      await purgeEntity(input.type, input.id, input.organizationId);
      return { success: true };
    }),

  bulkRestore: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      items: z.array(z.object({
        type: entityTypeSchema,
        id: z.string()
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      const failed: { type: string; id: string; message: string }[] = [];
      let restored = 0;
      for (const item of input.items) {
        try {
          await restoreEntity(item.type, item.id, input.organizationId);
          restored++;
        } catch (error) {
          failed.push({ type: item.type, id: item.id, message: error instanceof Error ? error.message : "Restore failed" });
        }
      }
      return { success: failed.length === 0, restored, failed };
    }),

  bulkPurgeNow: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      items: z.array(z.object({
        type: entityTypeSchema,
        id: z.string()
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      const { PURGE_ORDER } = await import("../../trash/registry");
      const orderMap = new Map(PURGE_ORDER.map((type, i) => [type, i]));
      const sortedItems = [...input.items].sort((a, b) => {
        const orderA = orderMap.get(a.type) ?? 99;
        const orderB = orderMap.get(b.type) ?? 99;
        return orderA - orderB;
      });

      // Per-item tolerance: one row still blocked by a live FK reference must not
      // abort the whole batch — report it and keep going.
      const failed: { type: string; id: string; message: string }[] = [];
      let purged = 0;
      for (const item of sortedItems) {
        try {
          await purgeEntity(item.type, item.id, input.organizationId);
          purged++;
        } catch (error) {
          failed.push({ type: item.type, id: item.id, message: error instanceof Error ? error.message : "Purge failed" });
        }
      }
      return { success: failed.length === 0, purged, failed };
    }),

  emptyTrash: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input?.organizationId);
      const { PURGE_ORDER } = await import("../../trash/registry");
      const allTrash = await listTrash(input?.organizationId);
      const orderMap = new Map(PURGE_ORDER.map((type, i) => [type, i]));
      const sortedTrash = [...allTrash].sort((a, b) => {
        const orderA = orderMap.get(a.type) ?? 99;
        const orderB = orderMap.get(b.type) ?? 99;
        return orderA - orderB;
      });

      const failed: { type: string; id: string; message: string }[] = [];
      let purged = 0;
      for (const item of sortedTrash) {
        try {
          await purgeEntity(item.type, item.id, input?.organizationId);
          purged++;
        } catch (error) {
          failed.push({ type: item.type, id: item.id, message: error instanceof Error ? error.message : "Purge failed" });
        }
      }
      return { success: failed.length === 0, purged, failed };
    }),
});
