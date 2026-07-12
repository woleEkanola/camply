import type { PrismaClient } from "@prisma/client";
import { generateSlug } from "../../utils/slugs";
import type { CampusRowInput, DepartmentRowInput, TribeRowInput } from "../../lib/import-export/schemas";
import type { EntityImportResult } from "../../lib/import-export/types";

type Db = PrismaClient | Omit<PrismaClient, "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;

function emptyResult(): EntityImportResult {
  return { created: 0, updated: 0, errors: [], warnings: [] };
}

/** Generates a globally-unique campus slug, checking ALL campuses (incl. soft-deleted) since `slug` has no partial unique index. */
export async function generateCampusSlug(prisma: Db, name: string): Promise<string> {
  const base = generateSlug(name) || "campus";
  let candidate = base;
  let suffix = 2;
  while (await prisma.campus.findFirst({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function importCampuses(
  prisma: Db,
  organizationId: string,
  rows: CampusRowInput[]
): Promise<EntityImportResult> {
  const result = emptyResult();
  const seenInFile = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nameKey = row.name.trim().toLowerCase();
    if (seenInFile.has(nameKey)) {
      result.errors.push({ rowIndex: i, name: row.name, message: "Duplicate campus name within this file" });
      continue;
    }
    seenInFile.add(nameKey);

    try {
      const existing = await prisma.campus.findFirst({
        where: { organizationId, deletedAt: null, name: { equals: row.name, mode: "insensitive" } },
      });

      if (existing) {
        await prisma.campus.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            address: row.address,
            city: row.city,
            country: row.country,
            state: row.state,
            zipCode: row.zipCode,
            pastor: row.pastor,
            phone: row.phone,
            email: row.email,
            campusCode: row.campusCode,
            active: row.active,
            signupOpen: row.signupOpen,
            displayOrder: row.displayOrder,
          },
        });
        result.updated++;
      } else {
        const slug = await generateCampusSlug(prisma, row.name);
        await prisma.campus.create({
          data: {
            organizationId,
            name: row.name,
            slug,
            address: row.address,
            city: row.city,
            country: row.country,
            state: row.state,
            zipCode: row.zipCode,
            pastor: row.pastor,
            phone: row.phone,
            email: row.email,
            campusCode: row.campusCode,
            active: row.active ?? true,
            signupOpen: row.signupOpen ?? true,
            displayOrder: row.displayOrder ?? 0,
          },
        });
        result.created++;
      }
    } catch (error) {
      result.errors.push({ rowIndex: i, name: row.name, message: error instanceof Error ? error.message : "Import failed" });
    }
  }

  return result;
}

export async function importTribes(prisma: Db, campId: string, rows: TribeRowInput[]): Promise<EntityImportResult> {
  const result = emptyResult();
  const seenInFile = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nameKey = row.name.trim().toLowerCase();
    if (seenInFile.has(nameKey)) {
      result.errors.push({ rowIndex: i, name: row.name, message: "Duplicate tribe name within this file" });
      continue;
    }
    seenInFile.add(nameKey);

    try {
      let code = row.code;
      if (code) {
        const codeTaken = await prisma.tribe.findFirst({
          where: {
            campId,
            deletedAt: null,
            code,
            NOT: { name: { equals: row.name, mode: "insensitive" } },
          },
        });
        if (codeTaken) {
          result.warnings.push({
            rowIndex: i,
            name: row.name,
            message: `Code "${code}" is already used by tribe "${codeTaken.name}" in this camp — imported without a code`,
          });
          code = undefined;
        }
      }

      const existing = await prisma.tribe.findFirst({
        where: { campId, deletedAt: null, name: { equals: row.name, mode: "insensitive" } },
      });

      const data = {
        name: row.name,
        code,
        color: row.color,
        description: row.description,
        meaning: row.meaning,
        motto: row.motto,
        scripture: row.scripture,
        gender: row.gender,
        ageRange: row.ageRange,
        maxCapacity: row.maxCapacity,
        allocationStrategy: row.allocationStrategy,
        displayOrder: row.displayOrder,
        logoUrl: row.logoUrl,
        bannerUrl: row.bannerUrl,
      };

      if (existing) {
        await prisma.tribe.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        await prisma.tribe.create({
          data: {
            campId,
            ...data,
            allocationStrategy: row.allocationStrategy ?? "MANUAL",
            displayOrder: row.displayOrder ?? 0,
          },
        });
        result.created++;
      }
    } catch (error) {
      result.errors.push({ rowIndex: i, name: row.name, message: error instanceof Error ? error.message : "Import failed" });
    }
  }

  return result;
}

export async function importDepartments(
  prisma: Db,
  organizationId: string,
  activeCampId: string | null,
  rows: DepartmentRowInput[]
): Promise<EntityImportResult> {
  const result = emptyResult();
  const seenInFile = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nameKey = row.name.trim().toLowerCase();
    if (seenInFile.has(nameKey)) {
      result.errors.push({ rowIndex: i, name: row.name, message: "Duplicate department name within this file" });
      continue;
    }
    seenInFile.add(nameKey);

    if (row.campScoped && !activeCampId) {
      result.errors.push({
        rowIndex: i,
        name: row.name,
        message: "Row is camp-scoped but this organization has no active camp set",
      });
      continue;
    }

    const campId = row.campScoped ? activeCampId : null;

    try {
      const existing = await prisma.department.findFirst({
        where: { organizationId, campId, deletedAt: null, name: { equals: row.name, mode: "insensitive" } },
      });

      const data = {
        name: row.name,
        description: row.description,
        maxCapacity: row.maxCapacity ?? null,
        responsibilities: row.responsibilities ?? [],
        status: row.status ?? "ACTIVE",
      };

      if (existing) {
        await prisma.department.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        await prisma.department.create({ data: { organizationId, campId, ...data } });
        result.created++;
      }
    } catch (error) {
      result.errors.push({ rowIndex: i, name: row.name, message: error instanceof Error ? error.message : "Import failed" });
    }
  }

  return result;
}
