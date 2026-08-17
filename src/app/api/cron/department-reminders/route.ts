import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

function linkFor(role: string) {
  return role === "VOLUNTEER" ? "/volunteer/departments?view=mine" : "/teacher/departments?view=mine";
}

/**
 * Reminds staff of checklist items due in the next 15 minutes, and flags
 * department heads once anything goes OVERDUE. The 30-minute dedupe window
 * (below) means this tolerates being run more often than it strictly needs —
 * scheduled every 5 minutes via vercel.json so the 15-minute lookahead can't
 * be missed between runs.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60_000);
  const dedupeSince = new Date(now.getTime() - 30 * 60_000);
  const due = await prisma.departmentChecklistExecution.findMany({
    where: { status: "PENDING", dueAt: { gt: now, lte: soon }, department: { enableDeadlineReminders: true } },
    include: { department: { select: { organizationId: true } } },
    take: 250,
  });
  let reminders = 0;
  for (const execution of due) {
    const profiles = execution.assignedStaffId
      ? await prisma.staffProfile.findMany({ where: { id: execution.assignedStaffId }, select: { userId: true, user: { select: { role: true } } } })
      : execution.positionId
        ? await prisma.staffProfile.findMany({ where: { positionAssignments: { some: { positionId: execution.positionId, isCurrent: true } }, deletedAt: null, status: "APPROVED" }, select: { userId: true, user: { select: { role: true } } } })
        : await prisma.staffProfile.findMany({ where: { departmentId: execution.departmentId, deletedAt: null, status: "APPROVED" }, select: { userId: true, user: { select: { role: true } } } });
    for (const profile of profiles) {
      const body = `${execution.taskTitle} is due in 15 minutes.`;
      const alreadySent = await prisma.notification.findFirst({ where: { userId: profile.userId, body, createdAt: { gte: dedupeSince } }, select: { id: true } });
      if (!alreadySent) {
        await prisma.notification.create({ data: { organizationId: execution.department.organizationId, userId: profile.userId, title: "Task approaching deadline", body, link: linkFor(profile.user.role), status: "SENT" } });
        reminders += 1;
      }
    }
  }

  const overdueResult = await prisma.departmentChecklistExecution.updateMany({
    where: { status: "PENDING", dueAt: { lt: now } },
    data: { status: "OVERDUE" },
  });
  const overdueGroups = await prisma.departmentChecklistExecution.groupBy({
    by: ["departmentId"],
    where: { status: "OVERDUE", date: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } },
    _count: { _all: true },
  });
  let headAlerts = 0;
  for (const group of overdueGroups) {
    const department = await prisma.department.findUnique({ where: { id: group.departmentId }, select: { name: true, organizationId: true, enableDeadlineReminders: true } });
    if (!department?.enableDeadlineReminders) continue;
    const heads = await prisma.staffProfile.findMany({
      where: { positionAssignments: { some: { isCurrent: true, position: { departmentId: group.departmentId, roleKind: { in: ["HEAD", "ASSISTANT_HEAD"] } } } }, deletedAt: null, status: "APPROVED" },
      select: { userId: true, user: { select: { role: true } } },
    });
    const body = `${department.name} has ${group._count._all} overdue task${group._count._all === 1 ? "" : "s"}.`;
    for (const head of heads) {
      const alreadySent = await prisma.notification.findFirst({ where: { userId: head.userId, body, createdAt: { gte: dedupeSince } }, select: { id: true } });
      if (!alreadySent) {
        await prisma.notification.create({ data: { organizationId: department.organizationId, userId: head.userId, title: "Department incomplete", body, link: linkFor(head.user.role), status: "SENT" } });
        headAlerts += 1;
      }
    }
  }

  return NextResponse.json({ reminders, newlyOverdue: overdueResult.count, headAlerts });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
