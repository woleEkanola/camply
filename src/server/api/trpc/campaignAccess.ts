import { TRPCError } from "@trpc/server";

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

export async function assertCampaignSender(
  ctx: { session: any; prisma: any },
  organizationId: string
): Promise<{ orgAdmin: boolean; forcedCampusId?: string }> {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

  if (ORG_ADMIN_ROLES.includes(user.role) && user.organizationId === organizationId) {
    return { orgAdmin: true };
  }

  if (user.organizationId === organizationId) {
    // Check org setting for campus rep messaging
    const org = await ctx.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings ?? {}) as Record<string, unknown>;

    if (settings?.campusRepMessagingEnabled === true) {
      // User is a campus rep — find their managed campus
      const managed = await ctx.prisma.campus.findFirst({
        where: { organizationId, reps: { some: { id: user.id } } },
        select: { id: true },
      });

      if (managed) {
        return { orgAdmin: false, forcedCampusId: managed.id };
      }
    }
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to send campaigns" });
}
