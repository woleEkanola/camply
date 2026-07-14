import crypto from "crypto";
import type { Prisma, PrismaClient, RegistrationStatus } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { assertTransition } from "./stateMachine";
import { RegistrationValidationError, validateSubmission } from "./validation";
import { runSideEffectsNow } from "./effects";
import { autoAssignTribeOnApproval } from "../tribe/engine";

type TxClient = PrismaClient | Prisma.TransactionClient;

export class RegistrationEngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistrationEngineError";
    this.code = code;
  }
}

/**
 * Wraps a function that calls an engine transition (which auto-sends email).
 * If sendEmail is false, the engine still runs but the UI can skip side effects
 * by toggling the event OFF before calling. For finer control, use the
 * communicationLog field on Registration to track manual email sends.
 */
export async function transitionWithEmailControl<T>(
  fn: () => Promise<T>,
  _sendEmail: boolean,
): Promise<T> {
  return fn();
}

function generateQrToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Assigns the next sequential registration number for a camp+campus pair
 * using a row-level lock on the counter so concurrent approvals can never
 * collide or skip (PRD Part 4 §6-7). The registration number identifies
 * which campus a camper is from - it never encodes the Venue.
 */
async function nextRegistrationNumber(
  tx: Prisma.TransactionClient,
  params: { orgCode: string | null; campName: string; campusCode: string | null; campId: string; campusId: string }
): Promise<string> {
  const counter = await tx.registrationCounter.upsert({
    where: { campId_campusId: { campId: params.campId, campusId: params.campusId } },
    create: { campId: params.campId, campusId: params.campusId, value: 0 },
    update: {},
  });

  // Row-level lock + increment. SQLite/pg both support this pattern via a raw update returning.
  const updated = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "RegistrationCounter" SET value = value + 1 WHERE id = ${counter.id} RETURNING value
  `;
  const seq = updated[0]?.value ?? counter.value + 1;

  const org = params.orgCode ?? "ORG";
  const campus = params.campusCode ?? "GEN";
  const seqStr = String(seq).padStart(5, "0");
  return `${org}-${params.campName}-${campus}-${seqStr}`;
}

/**
 * Creates (or returns the existing) draft registration for a camper+camp+campus.
 * Venue is intentionally NOT accepted here - parents pick a Campus at signup;
 * Venue assignment happens later, at approval/allocation time.
 */
export async function createDraft(params: {
  camperId: string;
  campId: string;
  campusId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.registration.findFirst({
      where: { camperId: params.camperId, campId: params.campId, deletedAt: null },
    });
    if (existing) return existing;

    const registration = await tx.registration.create({
      data: {
        camperId: params.camperId,
        campId: params.campId,
        campusId: params.campusId,
        status: "DRAFT",
      },
    });

    const camper = await tx.camper.findUniqueOrThrow({ where: { id: params.camperId } });
    await tx.camper.update({
      where: { id: params.camperId },
      data: { homeCampusId: params.campusId },
    });
    await logEvent(tx, {
      organizationId: camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_CREATED",
      newValue: { status: "DRAFT" },
    });

    return registration;
  });
}

/** Validates and submits a draft registration; moves to PENDING or APPROVED depending on camp config. */
export async function submitRegistration(params: { registrationId: string; actorId: string; submittedAt?: Date }) {
  const actualSubmittedAt = params.submittedAt ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true, camp: true, campus: true },
    });

    assertTransition(registration.status, "SUBMITTED");

    const failures = await validateSubmission(tx, { registrationId: registration.id, parentUserId: params.actorId });
    if (failures.length > 0) {
      throw new RegistrationValidationError(failures);
    }

    const nextStatus: RegistrationStatus = registration.camp.approvalMode === "AUTO" ? "APPROVED" : "PENDING";

    await tx.registration.update({
      where: { id: registration.id },
      data: { status: "SUBMITTED", submittedAt: actualSubmittedAt },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_SUBMITTED",
      previousValue: { status: registration.status },
      newValue: { status: "SUBMITTED" },
    });

    if (nextStatus === "APPROVED") {
      return approveRegistrationInTx(tx, { registrationId: registration.id, actorId: params.actorId });
    }

    const pending = await tx.registration.update({ where: { id: registration.id }, data: { status: "PENDING" } });
    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_PENDING_REVIEW",
      previousValue: { status: "SUBMITTED" },
      newValue: { status: "PENDING" },
    });
    return pending;
  });

  if (result.status === "APPROVED") {
    await autoAssignTribeOnApproval(result.id);
    await runSideEffectsNow(result.id, "REGISTRATION_APPROVED");
  } else if (result.status === "WAITLISTED") {
    await runSideEffectsNow(result.id, "REGISTRATION_WAITLISTED");
  } else if (result.status === "PENDING") {
    await runSideEffectsNow(result.id, "REGISTRATION_SUBMITTED");
  }

  return result;
}

async function approveRegistrationInTx(
  tx: Prisma.TransactionClient,
  params: { registrationId: string; actorId: string | null }
) {
  let registration = await tx.registration.findUniqueOrThrow({
    where: { id: params.registrationId },
    include: { camper: true, camp: { include: { venues: true } }, campus: true, venue: true },
  });

  assertTransition(registration.status, "APPROVED");

  // Venue assignment is deferred until approval (parents only pick a Campus at
  // signup). Auto-assign when the Camp has exactly one Venue; otherwise the
  // approver must assign one manually first.
  if (!registration.venueId) {
    if (registration.camp.venues.length === 1) {
      const soleVenue = registration.camp.venues[0];
      registration = await tx.registration.update({
        where: { id: registration.id },
        data: { venueId: soleVenue.id, venueAssignedAt: new Date() },
        include: { camper: true, camp: { include: { venues: true } }, campus: true, venue: true },
      });
    } else {
      throw new RegistrationEngineError(
        "VENUE_NOT_ASSIGNED",
        "Assign a venue before approving this registration."
      );
    }
  }

  // Re-check capacity under lock to prevent overbooking on concurrent approvals.
  if (registration.venue && registration.venue.quota > 0) {
    await tx.$queryRaw`SELECT id FROM "Venue" WHERE id = ${registration.venue.id} FOR UPDATE`;
    const approvedCount = await tx.registration.count({
      where: { venueId: registration.venue.id, status: "APPROVED" },
    });
    if (approvedCount >= registration.venue.quota) {
      if (registration.venue.fullBehavior === "PENDING_OK") {
        // allow over-capacity approval if explicitly configured
      } else {
        const waitlisted = await tx.registration.update({
          where: { id: registration.id },
          data: { status: "WAITLISTED" },
        });
        await logEvent(tx, {
          organizationId: registration.camper.organizationId,
          registrationId: registration.id,
          actorId: params.actorId,
          action: "REGISTRATION_WAITLISTED",
          previousValue: { status: registration.status },
          newValue: { status: "WAITLISTED", reason: "CAPACITY_REACHED" },
        });
        return waitlisted;
      }
    }
  }

  const registrationNumber = await nextRegistrationNumber(tx, {
    orgCode: registration.camp.orgCode,
    campName: registration.camp.name,
    campusCode: registration.campus.campusCode,
    campId: registration.camp.id,
    campusId: registration.campus.id,
  });
  const qrToken = generateQrToken();

  const updated = await tx.registration.update({
    where: { id: registration.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      registrationNumber,
      qrToken,
    },
  });

  await logEvent(tx, {
    organizationId: registration.camper.organizationId,
    registrationId: registration.id,
    actorId: params.actorId,
    action: "REGISTRATION_APPROVED",
    previousValue: { status: registration.status },
    newValue: { status: "APPROVED", registrationNumber, qrToken },
  });

  return updated;
}

export async function approveRegistration(params: { registrationId: string; actorId: string }) {
  const result = await prisma.$transaction((tx) => approveRegistrationInTx(tx, params));
  if (result.status === "APPROVED") {
    await autoAssignTribeOnApproval(result.id);
    await runSideEffectsNow(result.id, "REGISTRATION_APPROVED");
  } else {
    await runSideEffectsNow(result.id, "REGISTRATION_WAITLISTED");
  }
  return result;
}

export async function rejectRegistration(params: { registrationId: string; actorId: string; reason: string }) {
  const updated = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "REJECTED");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "REJECTED", rejectionReason: params.reason },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_REJECTED",
      previousValue: { status: registration.status },
      newValue: { status: "REJECTED", reason: params.reason },
    });

    return updated;
  });

  await runSideEffectsNow(updated.id, "REGISTRATION_REJECTED");
  return updated;
}

export async function waitlistRegistration(params: { registrationId: string; actorId: string }) {
  const updated = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "WAITLISTED");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "WAITLISTED" },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_WAITLISTED",
      previousValue: { status: registration.status },
      newValue: { status: "WAITLISTED" },
    });

    return updated;
  });

  await runSideEffectsNow(updated.id, "REGISTRATION_WAITLISTED");
  return updated;
}

export async function assignReviewer(params: { registrationId: string; actorId: string; reviewerId: string | null }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { reviewerId: params.reviewerId },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REVIEWER_ASSIGNED",
      previousValue: { reviewerId: registration.reviewerId },
      newValue: { reviewerId: params.reviewerId },
    });

    return updated;
  });
}

export async function addInternalNote(params: { registrationId: string; actorId: string; text: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });

    const existingNotes = Array.isArray(registration.internalNotes) ? registration.internalNotes : [];
    const newNote = { authorId: params.actorId, text: params.text, at: new Date().toISOString() };
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { internalNotes: [...existingNotes, newNote] as Prisma.InputJsonValue },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "INTERNAL_NOTE_ADDED",
      newValue: newNote,
    });

    return updated;
  });
}

export async function requestCorrection(params: { registrationId: string; actorId: string; message: string }) {
  const updated = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "REQUIRES_ACTION");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "REQUIRES_ACTION", correctionRequest: params.message },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "CORRECTION_REQUESTED",
      previousValue: { status: registration.status },
      newValue: { status: "REQUIRES_ACTION", message: params.message },
    });

    return updated;
  });

  await runSideEffectsNow(updated.id, "CORRECTION_REQUESTED");
  return updated;
}

/** Parent resubmits after a correction request or a rejection (if allowed). */
export async function resubmitRegistration(params: { registrationId: string; actorId: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true, camp: true },
    });

    if (registration.status === "REJECTED" && !registration.camp.allowResubmission) {
      throw new RegistrationEngineError("RESUBMISSION_NOT_ALLOWED", "This camp does not allow resubmission after rejection.");
    }

    assertTransition(registration.status, "PENDING");

    const failures = await validateSubmission(tx, { registrationId: registration.id, parentUserId: params.actorId });
    if (failures.length > 0) {
      throw new RegistrationValidationError(failures);
    }

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "PENDING", correctionRequest: null, rejectionReason: null },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_RESUBMITTED",
      previousValue: { status: registration.status },
      newValue: { status: "PENDING" },
    });

    return updated;
  });

  await runSideEffectsNow(result.id, "REGISTRATION_SUBMITTED");
  return result;
}

export async function cancelRegistration(params: { registrationId: string; actorId: string; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "CANCELLED");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "CANCELLED" },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_CANCELLED",
      previousValue: { status: registration.status },
      newValue: { status: "CANCELLED", reason: params.reason },
    });

    return updated;
  });
}

export async function archiveRegistration(params: { registrationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "ARCHIVED");

    const updated = await tx.registration.update({ where: { id: registration.id }, data: { status: "ARCHIVED" } });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_ARCHIVED",
      previousValue: { status: registration.status },
      newValue: { status: "ARCHIVED" },
    });

    return updated;
  });
}

export async function checkInRegistration(params: { registrationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    assertTransition(registration.status, "CHECKED_IN");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: params.actorId },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "CHECK_IN_COMPLETED",
      previousValue: { status: registration.status },
      newValue: { status: "CHECKED_IN" },
    });

    return updated;
  });
}

export async function checkOutRegistration(params: { registrationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    if (registration.status !== "CHECKED_IN") {
      throw new RegistrationEngineError("NOT_CHECKED_IN", "Camper is not currently checked in.");
    }

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { checkedOutAt: new Date() },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "CHECK_OUT_COMPLETED",
      newValue: { checkedOutAt: updated.checkedOutAt },
    });

    return updated;
  });
}

export async function transferVenue(params: { registrationId: string; actorId: string; newVenueId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });

    const newVenue = await tx.venue.findUniqueOrThrow({ where: { id: params.newVenueId } });
    if (newVenue.quota > 0 && registration.status === "APPROVED") {
      const approvedCount = await tx.registration.count({ where: { venueId: newVenue.id, status: "APPROVED" } });
      if (approvedCount >= newVenue.quota) {
        throw new RegistrationEngineError("VENUE_FULL", "The destination venue is at capacity.");
      }
    }

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { venueId: params.newVenueId, venueAssignedAt: new Date() },
    });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "REGISTRATION_TRANSFERRED_VENUE",
      previousValue: { venueId: registration.venueId },
      newValue: { venueId: params.newVenueId },
    });

    return updated;
  });
}

export async function regenerateQr(params: { registrationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    if (registration.status !== "APPROVED" && registration.status !== "CHECKED_IN") {
      throw new RegistrationEngineError("NOT_APPROVED", "Only approved registrations have a QR code to regenerate.");
    }

    const qrToken = generateQrToken();
    const updated = await tx.registration.update({ where: { id: registration.id }, data: { qrToken } });

    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "QR_REGENERATED",
      previousValue: { qrToken: registration.qrToken },
      newValue: { qrToken },
    });

    return updated;
  });
}
