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
});
