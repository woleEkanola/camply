import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { EXPORT_FORMATS, EXPORT_KINDS, EXPORT_SCOPES } from "../../export/types";
import { getExportDescriptor, listExportDescriptors } from "../../export/registry";
import { enqueueExportJob, retryExportJob, cancelExportJob, deleteExportJob } from "../../export/engine";
import "../../export/builders";

const exportKindSchema = z.enum(EXPORT_KINDS);
const exportFormatSchema = z.enum(EXPORT_FORMATS);
const exportScopeSchema = z.enum(EXPORT_SCOPES);

const enqueueParamsSchema = z.object({
  organizationId: z.string(),
  kind: exportKindSchema,
  format: exportFormatSchema,
  scope: exportScopeSchema,
  presetId: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
  selectedIds: z.array(z.string()).optional(),
});

/** Every own-job procedure re-verifies ownership/org rather than trusting the id alone. */
async function assertOwnsJob(ctx: { prisma: any; session: any }, id: string) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const job = await ctx.prisma.exportJob.findUnique({ where: { id } });
  if (!job) throw new TRPCError({ code: "NOT_FOUND" });
  const isOwner = job.userId === user.id;
  const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(user.role) && job.organizationId === user.organizationId;
  if (!isOwner && !isOrgAdmin) throw new TRPCError({ code: "FORBIDDEN" });
  return job;
}

export const exportRouter = createTRPCRouter({
  /** Formats/presets/filter shape for every registered export kind — drives the dialog. */
  describe: protectedProcedure.input(z.object({ kind: exportKindSchema })).query(({ input }) => {
    const d = getExportDescriptor(input.kind);
    return { kind: d.kind, label: d.label, formats: d.formats, presets: d.presets };
  }),

  describeAll: protectedProcedure.query(() =>
    listExportDescriptors().map((d) => ({ kind: d.kind, label: d.label, formats: d.formats, presets: d.presets }))
  ),

  /** Live summary shown before the user commits — record count for the current scope/filters. */
  estimate: protectedProcedure.input(enqueueParamsSchema).query(async ({ ctx, input }) => {
    const descriptor = getExportDescriptor(input.kind);
    await descriptor.authorize(ctx, input);
    const count = await descriptor.count({ prisma: ctx.prisma }, input);
    return { count };
  }),

  create: protectedProcedure
    .input(enqueueParamsSchema.extend({ label: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { label, ...params } = input;
      const job = await enqueueExportJob(ctx, params, label);
      return { id: job.id };
    }),

  listMine: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session!.user;
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(user.role);
      const jobs = await ctx.prisma.exportJob.findMany({
        where: {
          organizationId: input.organizationId,
          ...(isOrgAdmin ? {} : { userId: user.id }),
        },
        select: {
          id: true,
          kind: true,
          format: true,
          label: true,
          status: true,
          stage: true,
          progress: true,
          processed: true,
          total: true,
          fileName: true,
          fileSize: true,
          error: true,
          errorHint: true,
          createdAt: true,
          startedAt: true,
          updatedAt: true,
          completedAt: true,
          expiresAt: true,
          partRefs: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      // A job with more than one staged part never gets promoted to a single
      // artifact (see engine.ts's finalizeResumableJob) — the client needs to
      // know the count to render one download link per part instead of one.
      // partRefs itself (blob URLs) never leaves the server — see
      // blobStore.ts's privacy note on why those URLs must not reach the client.
      return jobs.map(({ partRefs, ...job }) => {
        const parts = Array.isArray(partRefs) ? (partRefs as { size?: number }[]) : [];
        return {
          ...job,
          partCount: parts.length,
          // job.fileSize is only set for a promoted single-file artifact —
          // a genuinely multi-part job never gets one, so sum the parts.
          fileSize: job.fileSize ?? (parts.length > 0 ? parts.reduce((sum, p) => sum + (p.size ?? 0), 0) : null),
        };
      });
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const job = await assertOwnsJob(ctx, input.id);
    const { fileData, ...rest } = job;
    return rest;
  }),

  retry: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await assertOwnsJob(ctx, input.id);
    const result = await retryExportJob(input.id);
    return { success: result.retried };
  }),

  cancel: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await assertOwnsJob(ctx, input.id);
    const result = await cancelExportJob(input.id);
    return { success: true, cancelled: result.cancelled };
  }),

  dismiss: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await assertOwnsJob(ctx, input.id);
    await deleteExportJob(input.id);
    return { success: true };
  }),
});
