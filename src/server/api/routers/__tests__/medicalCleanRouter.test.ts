import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";
let camper1Id = "";
let camper2Id = "";
let teacherProfileId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id, role, email, organizationId }, expires: "" },
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `MedicalClean Org ${stamp}`, slug: `medclean-${stamp}` },
  });
  organizationId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `MedicalClean Camp ${stamp}`,
      slug: `medclean-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      active: true,
      status: "OPEN",
    },
  });
  campId = camp.id;

  const owner = await prisma.user.create({
    data: {
      email: `medclean-owner-${stamp}@camply.test`,
      password: "password123",
      role: "OWNER",
      organizationId,
    },
  });
  ownerId = owner.id;

  const parent = await prisma.user.create({
    data: {
      email: `medclean-parent-${stamp}@camply.test`,
      password: "password123",
      role: "PARENT",
      organizationId,
    },
  });

  const campus = await prisma.campus.create({
    data: {
      name: `MedClean Campus ${stamp}`,
      slug: `medclean-campus-${stamp}`,
      organizationId,
      address: "1 Med Way",
      city: "Lagos",
      country: "Nigeria",
    },
  });

  // Camper 1 has placeholder values ("None", "N/A")
  const camper1 = await prisma.camper.create({
    data: {
      name: `Placeholder Camper ${stamp}`,
      userId: parent.id,
      organizationId,
      homeCampusId: campus.id,
      allergies: "None",
      medicalConditions: "N/A",
      medications: "Nil",
    },
  });
  camper1Id = camper1.id;

  await prisma.registration.create({
    data: {
      camperId: camper1.id,
      campId,
      campusId: campus.id,
      status: "APPROVED",
    },
  });

  // Camper 2 has legitimate short medical terms ("Egg", "TB", "No peanuts")
  const camper2 = await prisma.camper.create({
    data: {
      name: `Real Medical Camper ${stamp}`,
      userId: parent.id,
      organizationId,
      homeCampusId: campus.id,
      allergies: "Egg",
      medicalConditions: "TB",
      dietaryRestrictions: "No peanuts",
    },
  });
  camper2Id = camper2.id;

  await prisma.registration.create({
    data: {
      camperId: camper2.id,
      campId,
      campusId: campus.id,
      status: "APPROVED",
    },
  });

  // Teacher has placeholder allergies ("-") and legitimate conditions ("Asthma")
  const teacherUser = await prisma.user.create({
    data: {
      email: `medclean-teacher-${stamp}@camply.test`,
      password: "password123",
      role: "TEACHER",
      organizationId,
    },
  });
  const teacherProfile = await prisma.staffProfile.create({
    data: {
      userId: teacherUser.id,
      organizationId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Sarah",
      lastName: "Teacher",
      phone: "08012345678",
      email: teacherUser.email,
      allergies: "-",
      medicalConditions: "Asthma",
    },
  });
  teacherProfileId = teacherProfile.id;
});

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { camp: { organizationId } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.campus.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("medicalCleanRouter", () => {
  it("previewBulkCleanup detects placeholders while shielding protected terms", async () => {
    const admin = caller(ownerId, "OWNER", `medclean-owner-${stamp}@camply.test`);
    const preview = await admin.medicalClean.previewBulkCleanup({ organizationId, campId });

    expect(preview.summary.placeholderCount).toBe(4); // 3 from Camper 1 (None, N/A, Nil) + 1 from Teacher (-)

    // Verify candidates contain camper 1's fields
    const camper1Candidates = preview.candidates.filter((c) => c.id === camper1Id);
    expect(camper1Candidates).toHaveLength(3);
    expect(camper1Candidates.map((c) => c.field).sort()).toEqual(["allergies", "medicalConditions", "medications"].sort());

    // Verify candidates contain teacher's allergy (-)
    const teacherCandidates = preview.candidates.filter((c) => c.id === teacherProfileId);
    expect(teacherCandidates).toHaveLength(1);
    expect(teacherCandidates[0].field).toBe("allergies");

    // Verify Camper 2's fields are in preserved highlights and NOT in candidates
    const camper2Candidates = preview.candidates.filter((c) => c.id === camper2Id);
    expect(camper2Candidates).toHaveLength(0);

    const camper2Preserved = preview.preservedHighlights.filter((p) => p.id === camper2Id);
    expect(camper2Preserved).toHaveLength(3);
    expect(camper2Preserved.some((p) => p.value === "Egg" && p.isShortTermProtected)).toBe(true);
    expect(camper2Preserved.some((p) => p.value === "TB" && p.isShortTermProtected)).toBe(true);
    expect(camper2Preserved.some((p) => p.value === "No peanuts")).toBe(true);
  });

  it("executeBulkCleanup sets selected placeholder fields to null without touching real conditions", async () => {
    const admin = caller(ownerId, "OWNER", `medclean-owner-${stamp}@camply.test`);

    // Clean camper 1's placeholders
    const res = await admin.medicalClean.executeBulkCleanup({
      organizationId,
      items: [
        { id: camper1Id, model: "CAMPER", field: "allergies" },
        { id: camper1Id, model: "CAMPER", field: "medicalConditions" },
        { id: camper1Id, model: "CAMPER", field: "medications" },
        { id: teacherProfileId, model: "STAFF", field: "allergies" },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.cleanedCount).toBe(4);

    // Verify DB state for camper 1
    const updatedCamper1 = await prisma.camper.findUnique({ where: { id: camper1Id } });
    expect(updatedCamper1?.allergies).toBeNull();
    expect(updatedCamper1?.medicalConditions).toBeNull();
    expect(updatedCamper1?.medications).toBeNull();

    // Verify DB state for teacher
    const updatedTeacher = await prisma.staffProfile.findUnique({ where: { id: teacherProfileId } });
    expect(updatedTeacher?.allergies).toBeNull();
    expect(updatedTeacher?.medicalConditions).toBe("Asthma"); // untouched!

    // Verify DB state for camper 2 (completely untouched!)
    const updatedCamper2 = await prisma.camper.findUnique({ where: { id: camper2Id } });
    expect(updatedCamper2?.allergies).toBe("Egg");
    expect(updatedCamper2?.medicalConditions).toBe("TB");
    expect(updatedCamper2?.dietaryRestrictions).toBe("No peanuts");
  });
});
