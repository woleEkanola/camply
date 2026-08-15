import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient<any> | Prisma.TransactionClient;

export function dateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Date must use YYYY-MM-DD");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function atCampLocalTime(day: Date, dueTime?: string | null) {
  if (!dueTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return null;
  return new Date(`${dateKey(day)}T${dueTime}:00+01:00`);
}

function isSameDay(a: Date | null | undefined, b: Date) {
  return !!a && dateKey(a) === dateKey(b);
}

function shouldGenerate(
  routine: string,
  date: Date,
  camp: { startDate: Date; endDate: Date; arrivalDate: Date | null; departureDate: Date | null },
  specificDate?: Date | null
) {
  const start = dateOnly(camp.startDate);
  const end = dateOnly(camp.endDate);
  if (routine === "SPECIFIC_DAY") return isSameDay(specificDate, date);
  if (routine === "BEFORE_CAMP" || routine === "ONE_TIME") return isSameDay(start, date);
  if (routine === "ARRIVAL") return isSameDay(camp.arrivalDate ?? start, date);
  if (routine === "AFTER_CHECKOUT" || routine === "AFTER_CAMP") return isSameDay(camp.departureDate ?? end, date);
  return date >= start && date <= end;
}

/** Lazily creates only the requested operational day's execution rows. */
export async function ensureDepartmentExecutions(
  db: DbClient,
  input: { campId: string; date: string | Date; departmentId?: string; contextType?: string; contextId?: string; contextName?: string; contextStartsAt?: Date }
) {
  const date = dateOnly(input.date);
  const camp = await db.camp.findUniqueOrThrow({
    where: { id: input.campId },
    select: { startDate: true, endDate: true, arrivalDate: true, departureDate: true },
  });
  const items = await db.departmentChecklistItem.findMany({
    where: {
      active: true,
      department: { campId: input.campId, status: "ACTIVE", deletedAt: null, enableRoutineChecklists: true },
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    },
    include: {
      department: { select: { enableProgrammeTriggeredTasks: true } },
      position: { select: { id: true, name: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ departmentId: "asc" }, { sortOrder: "asc" }],
  });

  const sessions = await db.scoredSession.findMany({
    where: { campId: input.campId, date, status: { not: "CANCELLED" } },
    select: { id: true, name: true, startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  let created = 0;
  for (const item of items) {
    if (!shouldGenerate(item.routine, date, camp, item.specificDate)) continue;
    const programmeRoutine = ["BEFORE_PROGRAMME", "DURING_PROGRAMME", "AFTER_PROGRAMME"].includes(item.routine);
    const mealRoutine = ["BEFORE_MEAL", "DURING_MEAL", "AFTER_MEAL"].includes(item.routine);
    if ((programmeRoutine || mealRoutine) && !item.department.enableProgrammeTriggeredTasks) continue;
    const mealSessions = sessions.filter((session) => /breakfast|lunch|dinner|meal/i.test(session.name));
    const contexts = input.contextId
      ? [{ id: input.contextId, name: input.contextName ?? null, startsAt: input.contextStartsAt ?? null, type: input.contextType ?? "PROGRAMME" }]
      : programmeRoutine && sessions.length
        ? sessions.map((session) => ({ ...session, type: "PROGRAMME" }))
        : mealRoutine && mealSessions.length
          ? mealSessions.map((session) => ({ ...session, type: "MEAL" }))
          : [{ id: item.contextLabel ?? item.routine, name: item.contextLabel ?? null, startsAt: null, type: item.contextLabel ? "CONTEXT" : null }];
    for (const context of contexts) {
      const executionKey = `${item.id}:${dateKey(date)}:${context.id}`;
      const result = await db.departmentChecklistExecution.upsert({
      where: { executionKey },
      update: {},
      create: {
        executionKey,
        checklistItemId: item.id,
        departmentId: item.departmentId,
        campId: input.campId,
        date,
        contextType: context.type,
        contextId: programmeRoutine || mealRoutine ? context.id : null,
        contextName: context.name,
        contextStartsAt: context.startsAt,
        taskTitle: item.title,
        taskDescription: item.description,
        routine: item.routine,
        sourceGroup: item.sourceGroup,
        assignmentType: item.assignmentType,
        positionId: item.positionId,
        roleNameSnapshot: item.position?.name,
        assignedStaffId: item.assignedStaffId,
        assignedNameSnapshot: item.assignedStaff
          ? `${item.assignedStaff.firstName} ${item.assignedStaff.lastName}`
          : null,
        dueAt: atCampLocalTime(date, item.dueTime),
        required: item.required,
        definitionVersion: item.version,
      },
      select: { createdAt: true, updatedAt: true },
    });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
    }
  }
  return { created };
}

export async function activeStaffProfileForUser(db: DbClient, userId: string, campId: string) {
  return db.staffProfile.findFirst({
    where: { userId, campId, status: "APPROVED", deletedAt: null },
    select: { id: true, departmentId: true, firstName: true, lastName: true },
  });
}

export async function currentPositionIdsForStaff(db: DbClient, staffId: string) {
  const assignments = await db.positionAssignment.findMany({
    where: {
      staffId,
      isCurrent: true,
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      position: { status: "ACTIVE", deletedAt: null },
    },
    select: { positionId: true, position: { select: { parentPositionId: true } } },
  });
  const ids = new Set(assignments.map((item) => item.positionId));
  let frontier = assignments.map((item) => item.position.parentPositionId).filter((id): id is string => !!id);
  while (frontier.length) {
    const next = await db.position.findMany({
      where: { id: { in: frontier } },
      select: { id: true, parentPositionId: true },
    });
    frontier = [];
    for (const position of next) {
      if (ids.has(position.id)) continue;
      ids.add(position.id);
      if (position.parentPositionId) frontier.push(position.parentPositionId);
    }
  }
  return [...ids];
}

export async function isDepartmentLeader(db: DbClient, userId: string, departmentId: string) {
  return Boolean(
    await db.positionAssignment.findFirst({
      where: {
        isCurrent: true,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        staff: { userId, status: "APPROVED", deletedAt: null },
        position: { departmentId, roleKind: { in: ["HEAD", "ASSISTANT_HEAD"] }, status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    })
  );
}
