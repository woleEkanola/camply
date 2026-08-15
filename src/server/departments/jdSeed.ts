import type { ChecklistRoutine, Prisma, PrismaClient } from "@prisma/client";
import jd from "../../../prisma/data/teen-camp-organogram-2026.json";

type DbClient = PrismaClient<any> | Prisma.TransactionClient;

type JdUnit = (typeof jd.units)[number];

export interface JdSeedResult {
  departmentsCreated: number;
  departmentsUpdated: number;
  positionsCreated: number;
  positionsUpdated: number;
  checklistItemsCreated: number;
}

function departmentRoleKind(unit: JdUnit): "HEAD" | "LEAD" {
  return unit.departmentName === "Venue Management Department (VMD)" && unit.positionName !== "VMD Head"
    ? "LEAD"
    : "HEAD";
}

function meaningful(values: string[] | undefined) {
  return values?.filter(Boolean) ?? [];
}

/**
 * Idempotently installs the organizational definition from the 2026 Teen Camp
 * Organogram & JD. It creates structure and vacant roles only; it never creates
 * or assigns fake people. Existing administrator-authored content wins unless
 * overwriteExisting is explicitly requested.
 */
export async function seedTeenCampDepartments(
  db: DbClient,
  input: {
    organizationId: string;
    campId: string;
    actorId?: string;
    overwriteExisting?: boolean;
  }
): Promise<JdSeedResult> {
  const result: JdSeedResult = {
    departmentsCreated: 0,
    departmentsUpdated: 0,
    positionsCreated: 0,
    positionsUpdated: 0,
    checklistItemsCreated: 0,
  };

  const departments = new Map<string, { id: string; name: string }>();

  for (const definition of jd.departments) {
    // Match by the stable jdKey first (immune to admin renames); fall back
    // to exact name for departments installed before jdKey existed.
    const existing =
      (await db.department.findFirst({
        where: {
          organizationId: input.organizationId,
          campId: input.campId,
          jdKey: definition.jdKey,
          deletedAt: null,
        },
      })) ??
      (await db.department.findFirst({
        where: {
          organizationId: input.organizationId,
          campId: input.campId,
          name: definition.name,
          deletedAt: null,
        },
      }));

    const sourceUnit = jd.units.find(
      (unit) => unit.departmentName === definition.name && departmentRoleKind(unit) === "HEAD"
    );
    const guide = sourceUnit
      ? {
          purpose: sourceUnit.purpose || null,
          description: sourceUnit.purpose || null,
          responsibilities: meaningful(sourceUnit.responsibilities),
          authority: meaningful(sourceUnit.authority),
          successMeasures: meaningful(sourceUnit.successMeasures),
        }
      : {};

    if (existing) {
      const data = input.overwriteExisting
        ? guide
        : {
            ...(existing.purpose ? {} : { purpose: sourceUnit?.purpose || null }),
            ...(existing.description ? {} : { description: sourceUnit?.purpose || null }),
            ...(existing.responsibilities.length ? {} : { responsibilities: meaningful(sourceUnit?.responsibilities) }),
            ...(existing.authority.length ? {} : { authority: meaningful(sourceUnit?.authority) }),
            ...(existing.successMeasures.length ? {} : { successMeasures: meaningful(sourceUnit?.successMeasures) }),
          };
      const updated = await db.department.update({
        where: { id: existing.id },
        data: {
          ...data,
          // Only force status/displayOrder back to the JD's values when the
          // admin explicitly asked to overwrite — otherwise re-installing
          // silently un-archives departments or discards manual ordering.
          ...(input.overwriteExisting ? { displayOrder: definition.displayOrder, status: "ACTIVE" } : {}),
          jdKey: existing.jdKey ?? definition.jdKey,
          enableProgrammeTriggeredTasks: jd.units.some((unit) => unit.departmentName === definition.name && unit.tasks.some((task) => task.routine.includes("PROGRAMME"))),
        },
      });
      departments.set(definition.name, updated);
      result.departmentsUpdated += 1;
    } else {
      const created = await db.department.create({
        data: {
          organizationId: input.organizationId,
          campId: input.campId,
          name: definition.name,
          jdKey: definition.jdKey,
          systemKey: definition.name === "Camp Command" ? "CAMP_COMMAND" : null,
          displayOrder: definition.displayOrder,
          status: "ACTIVE",
          enableProgrammeTriggeredTasks: jd.units.some((unit) => unit.departmentName === definition.name && unit.tasks.some((task) => task.routine.includes("PROGRAMME"))),
          ...guide,
        },
      });
      departments.set(definition.name, created);
      result.departmentsCreated += 1;
    }
  }

  for (const definition of jd.departments) {
    if (!definition.parent) continue;
    const department = departments.get(definition.name);
    const parent = departments.get(definition.parent);
    if (department && parent) {
      await db.department.update({ where: { id: department.id }, data: { parentDepartmentId: parent.id } });
    }
  }

  const positions = new Map<string, { id: string; name: string; departmentId: string | null }>();

  for (const unit of jd.units) {
    const department = departments.get(unit.departmentName);
    if (!department) continue;
    const existing = await db.position.findFirst({
      where: { campId: input.campId, departmentId: department.id, name: unit.positionName, deletedAt: null },
    });
    const roleData = {
      roleKind: departmentRoleKind(unit),
      purpose: unit.purpose || null,
      responsibilities: meaningful(unit.responsibilities),
      authority: meaningful(unit.authority),
      successMeasures: meaningful(unit.successMeasures),
      status: "ACTIVE",
    } as const;
    if (existing) {
      const updated = await db.position.update({
        where: { id: existing.id },
        data: input.overwriteExisting
          ? roleData
          : {
              roleKind: roleData.roleKind,
              ...(existing.purpose ? {} : { purpose: roleData.purpose }),
              ...(existing.responsibilities.length ? {} : { responsibilities: roleData.responsibilities }),
              ...(existing.authority.length ? {} : { authority: roleData.authority }),
              ...(existing.successMeasures.length ? {} : { successMeasures: roleData.successMeasures }),
            },
      });
      positions.set(unit.positionName, updated);
      result.positionsUpdated += 1;
    } else {
      const created = await db.position.create({
        data: {
          name: unit.positionName,
          campId: input.campId,
          departmentId: department.id,
          displayOrder: 0,
          ...roleData,
        },
      });
      positions.set(unit.positionName, created);
      result.positionsCreated += 1;
    }
  }

  // Create every subordinate JD role even where the document has no separate
  // long-form section for it (e.g. Registration Officers or Prayer Leaders).
  for (const unit of jd.units) {
    const parent = positions.get(unit.positionName);
    const department = departments.get(unit.departmentName);
    if (!parent || !department) continue;
    for (const [index, roleName] of unit.supervises.entries()) {
      let role = positions.get(roleName);
      if (!role) {
        const existing = await db.position.findFirst({
          where: { campId: input.campId, departmentId: department.id, name: roleName, deletedAt: null },
        });
        role =
          existing ??
          (await db.position.create({
            data: {
              name: roleName,
              campId: input.campId,
              departmentId: department.id,
              parentPositionId: parent.id,
              displayOrder: index + 1,
              roleKind: roleName.toLowerCase().includes("lead") ? "LEAD" : "MEMBER",
            },
          }));
        if (!existing) result.positionsCreated += 1;
        positions.set(roleName, role);
      }
    }
  }

  // Wire reporting lines only after all named roles exist.
  for (const unit of jd.units) {
    if (!unit.reportsTo) continue;
    const position = positions.get(unit.positionName);
    const parent = positions.get(unit.reportsTo);
    if (position && parent && position.id !== parent.id) {
      await db.position.update({ where: { id: position.id }, data: { parentPositionId: parent.id } });
    }
  }

  // Explicit assistant-leader provision for every operational department.
  // These roles are vacant by default and never invent people assignments.
  for (const definition of jd.departments.filter((item) => !["Camp Board", "Camp Command"].includes(item.name))) {
    const department = departments.get(definition.name);
    if (!department) continue;
    const head = jd.units.find(
      (unit) => unit.departmentName === definition.name && departmentRoleKind(unit) === "HEAD"
    );
    const headPosition = head ? positions.get(head.positionName) : undefined;
    const assistantName = `${definition.name} Assistant Leader`;
    const existing = await db.position.findFirst({
      where: { campId: input.campId, departmentId: department.id, roleKind: "ASSISTANT_HEAD", deletedAt: null },
    });
    if (!existing) {
      await db.position.create({
        data: {
          name: assistantName,
          campId: input.campId,
          departmentId: department.id,
          parentPositionId: headPosition?.id,
          roleKind: "ASSISTANT_HEAD",
          displayOrder: 1,
          purpose: `Support the ${head?.positionName ?? "department leader"} and act on their behalf when delegated.`,
        },
      });
      result.positionsCreated += 1;
    }
  }

  for (const unit of jd.units) {
    const department = departments.get(unit.departmentName);
    const position = positions.get(unit.positionName);
    if (!department || !position) continue;
    for (const task of unit.tasks) {
      const existing = await db.departmentChecklistItem.findFirst({
        where: {
          departmentId: department.id,
          positionId: position.id,
          title: task.title,
          routine: task.routine as ChecklistRoutine,
        },
      });
      if (!existing) {
        await db.departmentChecklistItem.create({
          data: {
            departmentId: department.id,
            title: task.title,
            routine: task.routine as ChecklistRoutine,
            sourceGroup: task.sourceGroup,
            assignmentType: "ROLE",
            positionId: position.id,
            required: true,
            active: true,
            sortOrder: task.sortOrder,
            createdById: input.actorId,
            updatedById: input.actorId,
          },
        });
        result.checklistItemsCreated += 1;
      }
    }
  }

  return result;
}
