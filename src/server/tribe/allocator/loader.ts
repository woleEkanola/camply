import type { PrismaClient } from "@prisma/client";
import type { TribeWithCounts, AllocationUnit } from "./types";
import { calculateAge } from "../../registration/validation";

async function loadTribes(tx: PrismaClient, campId: string): Promise<TribeWithCounts[]> {
  const tribes = await tx.tribe.findMany({
    where: { campId, status: "ACTIVE", deletedAt: null },
    include: {
      registrations: {
        where: { deletedAt: null },
        select: { id: true, camper: true, campusId: true },
      },
    },
  });

  return tribes.map((t) => {
    const registrations = t.registrations;
    const population = registrations.length;

    return {
      id: t.id,
      name: t.name,
      campId: t.campId,
      gender: (t.gender as string) ?? null,
      ageRange: (t.ageRange as string) ?? null,
      maxCapacity: (t.maxCapacity as number | null) ?? null,
      isAllocationLocked: (t as any).isAllocationLocked === true,
      status: t.status,
      population,
      sameGenderCount: 0,
      sameAgeGroupCount: 0,
      sameCampusCount: 0,
      sameChurchCount: 0,
      sameSchoolCount: 0,
    };
  });
}

async function loadUnits(
  tx: PrismaClient,
  campId: string,
  scope: "approved" | "all",
): Promise<AllocationUnit[]> {
  const registrations = await tx.registration.findMany({
    where: {
      campId,
      status: scope === "all"
        ? { in: ["APPROVED", "CHECKED_IN"] }
        : { in: ["APPROVED"] },
      tribeId: null,
      deletedAt: null,
    },
    include: {
      camper: {
        select: {
          id: true,
          name: true,
          dateOfBirth: true,
          gender: true,
          userId: true,
          school: true,
          church: true,
          medicalProfile: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const siblingMap = new Map<string, string[]>();
  for (const r of registrations) {
    const key = r.camper.userId;
    if (!siblingMap.has(key)) siblingMap.set(key, []);
    siblingMap.get(key)!.push(r.id);
  }

  return registrations.map((r) => ({
    registrationId: r.id,
    camper: {
      id: r.camper.id,
      name: r.camper.name,
      dateOfBirth: r.camper.dateOfBirth as Date | null,
      gender: (r.camper.gender as string | null) ?? null,
      userId: r.camper.userId,
      school: (r.camper.school as string | null) ?? null,
      church: (r.camper.church as string | null) ?? null,
      medicalProfile: (r.camper as any).medicalProfile ?? null,
    },
    campusId: r.campusId,
    siblingGroupIds: (siblingMap.get(r.camper.userId) ?? []).filter((id) => id !== r.id),
  }));
}

export async function loadAllocationInput(
  tx: PrismaClient,
  campId: string,
  scope: "approved" | "all" = "approved",
) {
  const [tribes, units] = await Promise.all([
    loadTribes(tx, campId),
    loadUnits(tx, campId, scope),
  ]);

  return { tribes, units };
}

export function ageGroup(dateOfBirth: Date | null, cutoff: Date): string {
  if (!dateOfBirth) return "unknown";
  const age = calculateAge(dateOfBirth, cutoff);
  if (age <= 12) return "10-12";
  if (age <= 15) return "13-15";
  return "16-18";
}
