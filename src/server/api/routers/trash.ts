import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { assertOrgAdmin } from "../trpc/scoping";
import { listTrash, restoreEntity, purgeEntity } from "../../trash/service";

const entityTypeSchema = z.enum([
  "campus",
  "venue",
  "camp",
  "camper",
  "registration",
  "staffProfile",
  "tribe",
  "department",
  "hostel",
  "room",
  "bed",
  "formField",
  "document",
  "documentRequirement",
  "user",
]);

export const trashRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      return listTrash(input.organizationId);
    }),

  restore: protectedProcedure
    .input(z.object({ organizationId: z.string(), type: entityTypeSchema, id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      return restoreEntity(input.type, input.id, input.organizationId);
    }),

  purgeNow: protectedProcedure
    .input(z.object({ organizationId: z.string(), type: entityTypeSchema, id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      await purgeEntity(input.type, input.id, input.organizationId);
      return { success: true };
    }),

  bulkRestore: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      items: z.array(z.object({
        type: entityTypeSchema,
        id: z.string()
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      for (const item of input.items) {
        await restoreEntity(item.type, item.id, input.organizationId);
      }
      return { success: true };
    }),

  bulkPurgeNow: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
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

      for (const item of sortedItems) {
        await purgeEntity(item.type, item.id, input.organizationId);
      }
      return { success: true };
    }),

  emptyTrash: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      const { PURGE_ORDER } = await import("../../trash/registry");
      const allTrash = await listTrash(input.organizationId);
      const orderMap = new Map(PURGE_ORDER.map((type, i) => [type, i]));
      const sortedTrash = [...allTrash].sort((a, b) => {
        const orderA = orderMap.get(a.type) ?? 99;
        const orderB = orderMap.get(b.type) ?? 99;
        return orderA - orderB;
      });

      for (const item of sortedTrash) {
        await purgeEntity(item.type, item.id, input.organizationId);
      }
      return { success: true };
    }),
});
