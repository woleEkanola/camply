import type { MedicalSeverity } from "@/lib/medical";

/** Mirrors the camper/registration shape returned by the scan router's
 * Prisma `include` (see scan.ts) and fabricated offline by useOfflineScanner. */
export interface ScanCamper {
  id: string;
  name: string;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  photoUrl?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  dietaryRestrictions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  relationship?: string | null;
  parentPhone?: string | null;
  teenPhone?: string | null;
  [key: string]: unknown;
}

export interface ScanRegistration {
  id: string;
  registrationNumber: string;
  status: string;
  qrToken?: string | null;
  checkedOutAt?: string | Date | null;
  checkoutCollectorName?: string | null;
  checkoutCollectorRelationship?: string | null;
  camper: ScanCamper;
  campus?: { name: string } | null;
  tribe?: { name: string } | null;
  room?: { name: string; hostel?: { name: string } | null } | null;
  bed?: { label: string } | null;
  teacher?: { name: string } | null;
  [key: string]: unknown;
}

export type ScanResult =
  | {
      result: "SUCCESS";
      actionPerformed: string;
      registration: ScanRegistration;
      mealRecord?: unknown;
      medicalSeverity?: MedicalSeverity;
      medicalFlags?: string[];
    }
  | {
      result: "DUPLICATE";
      message: string;
      originalTime: string | Date;
      originalVolunteerName: string;
      originalStation: string;
      metadata?: Record<string, unknown>;
      registration: ScanRegistration;
    }
  | {
      result: "REQUIRES_MEDICAL_ACKNOWLEDGEMENT";
      registration: ScanRegistration;
      medicalSeverity?: MedicalSeverity;
      medicalFlags?: string[];
    }
  | {
      result: "REQUIRES_CHECKOUT_DETAILS";
      registration: ScanRegistration;
    };

export interface CheckoutDetails {
  collectorName: string;
  collectorRelationship: string;
  details?: Record<string, unknown>;
}

export interface ScanSubmitPayload {
  qrToken?: string;
  query?: string;
  acknowledgedMedical?: boolean;
  checkoutDetails?: CheckoutDetails;
}
