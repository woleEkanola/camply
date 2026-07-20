import { z } from "zod";

export const recipientTypeSchema = z.enum([
  "PARENTS",
  "TEACHERS",
  "VOLUNTEERS",
  "CAMPUS_REPS",
  "ADMINS",
  "ALL",
]);

export type RecipientType = z.infer<typeof recipientTypeSchema>;

export const registrationStatusFilter = z.enum([
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "REQUIRES_ACTION",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "CANCELLED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "COMPLETED",
]);

export const dateRangeFilter = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const previousCampaignFilter = z.object({
  campaignId: z.string(),
  opened: z.boolean().optional(),
});

export const audienceFilterSchema = z.object({
  recipientType: recipientTypeSchema,
  filters: z
    .object({
      registrationStatus: z.array(registrationStatusFilter).optional(),
      campId: z.string().optional(),
      campusId: z.string().optional(),
      tribeId: z.string().optional(),
      hostelId: z.string().optional(),
      departmentId: z.string().optional(),
      teacherId: z.string().optional(),
      volunteerDepartment: z.string().optional(),
      gender: z.enum(["MALE", "FEMALE", "MIXED"]).optional(),
      ageRange: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      applicationDate: dateRangeFilter.optional(),
      approvalDate: dateRangeFilter.optional(),
      checkInDate: dateRangeFilter.optional(),
      checkOutDate: dateRangeFilter.optional(),
      emailVerified: z.boolean().optional(),
      hasReceivedPreviousCampaign: previousCampaignFilter.optional(),
      hasOpenedPreviousCampaign: previousCampaignFilter.optional(),
      hasNotOpenedPreviousCampaign: previousCampaignFilter.optional(),
      hasFailedDelivery: z.boolean().optional(),
      customTags: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
});

export type AudienceFilter = z.infer<typeof audienceFilterSchema>;
export type DateRangeFilter = z.infer<typeof dateRangeFilter>;
