// Email variable registry — all available template variables with labels and sample data

export interface EmailVariable {
  key: string;
  label: string;
  category: "camper" | "parent" | "camp" | "registration" | "staff" | "organization" | "other";
  sampleValue: string;
}

export const EMAIL_VARIABLES: EmailVariable[] = [
  // Parent
  { key: "parent_name", label: "Parent Name", category: "parent", sampleValue: "Sarah Johnson" },
  { key: "parent_email", label: "Parent Email", category: "parent", sampleValue: "sarah@example.com" },
  { key: "parent_first_name", label: "Parent First Name", category: "parent", sampleValue: "Sarah" },

  // Camper
  { key: "camper_name", label: "Camper Name", category: "camper", sampleValue: "Daniel Johnson" },
  { key: "camper_first_name", label: "Camper First Name", category: "camper", sampleValue: "Daniel" },
  { key: "camper_age", label: "Camper Age", category: "camper", sampleValue: "16" },

  // Camp
  { key: "camp_name", label: "Camp Name", category: "camp", sampleValue: "Teen Camp 2026" },
  { key: "centre_name", label: "Centre Name", category: "camp", sampleValue: "Lekki Centre" },
  { key: "reporting_date", label: "Reporting Date", category: "camp", sampleValue: "August 14, 2026" },

  // Registration
  { key: "registration_number", label: "Registration Number", category: "registration", sampleValue: "TC26-LEK-0042" },
  { key: "registration_url", label: "Registration URL", category: "registration", sampleValue: "https://app.camply.ng/dashboard/register/abc123" },
  { key: "qr_code", label: "QR Code", category: "registration", sampleValue: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAYAAABUmhYnAAAAAklEQVR4AewaftIAAAKbSURBVO3BQW7sWAwEwSxC979yjpdcPaAhqb/NYUT8wRqjWKMUa5RijVKsUYo1SrFGKdYoxRqlWKMUa5RijVKsUYo1SrFGKdYoFzcl4ZtU7kjCiUqXhG9SuaNYoxRrlGKNcvEwlScl4RNJeJPKk5LwpGKNUqxRijXKxcuS8AmVTyThEypPSsInVN5UrFGKNUqxRrkYRqVLwv9JsUYp1ijFGuVimCScJOFE5S8r1ijFGqVYo1y8TOVfUjlJwh0qv0mxRinWKMUa5eJhSfiXVLokdCp3JOE3K9YoxRqlWKNc3KTymyShU+mS8AmVv6RYoxRrlGKNcnFTEjqVLglPUulUuiR0SehUuiScJOFJKm8q1ijFGqVYo1z8MionSfgmlS4JncpJErokdCpPKtYoxRqlWKNcfJnKJ5LQqZwk4SQJncokxRqlWKMUa5SLl6l0SehUTlROktCpdEnoVD6RhE7lJAmdykkSOpU7ijVKsUYp1ijxBy9KQqfSJaFT6ZLQqXwiCScqb0pCp/KmYo1SrFGKNUr8wR+WhCepfCIJnUqXhBOVJxVrlGKNUqxR4g9uSMI3qZwkoVM5ScKJSpeETqVLwh0qdxRrlGKNUqxRLh6m8qQknCShU+mS8AmVE5UuCScqJ0l4UrFGKdYoxRrl4mVJ+ITKHUnoVE6ScIdKl4QuCScqTyrWKMUapVijXAyj0iWhU3mTSpeETuVNxRqlWKMUa5SLYZJwkoRO5U0q31SsUYo1SrFGuXiZyptUTpLQqdyRhE7ljiR0KncUa5RijVKsUS4eloRvSkKncpKETuUTKidJOFHpVJ5UrFGKNUqxRok/WGMUa5RijVKsUYo1SrFGKdYoxRqlWKMUa5RijVKsUYo1SrFGKdYoxRrlP11s+OUgUk8xAAAAAElFTkSuQmCC" },

  // Approval / Rejection
  { key: "approval_reason", label: "Approval Reason", category: "registration", sampleValue: "All documents verified" },
  { key: "rejection_reason", label: "Rejection Reason", category: "registration", sampleValue: "Age requirement not met" },
  { key: "correction_message", label: "Correction Message", category: "registration", sampleValue: "Please upload a valid birth certificate" },

  // Tribe
  { key: "tribe_name", label: "Tribe Name", category: "camp", sampleValue: "Tribe of Judah" },
  { key: "tribe_color", label: "Tribe Color", category: "camp", sampleValue: "#E53935" },

  // Organization
  { key: "organization_name", label: "Organization Name", category: "organization", sampleValue: "Grace Community Church" },

  // Staff
  { key: "staff_name", label: "Staff Name", category: "staff", sampleValue: "John Okafor" },
  { key: "staff_role", label: "Staff Role", category: "staff", sampleValue: "Teacher" },
  { key: "dashboard_url", label: "Dashboard URL", category: "other", sampleValue: "https://app.camply.ng/teacher" },

  // OTP
  { key: "otp_code", label: "OTP Code", category: "other", sampleValue: "482917" },
  { key: "verify_url", label: "Verify URL", category: "other", sampleValue: "https://app.camply.ng/api/auth/verify-email?token=abc123" },

  // Generic
  { key: "support_email", label: "Support Email", category: "organization", sampleValue: "help@gracechurch.org" },
  { key: "support_phone", label: "Support Phone", category: "organization", sampleValue: "+234 800 000 0000" },
];

/** Returns sample data for every variable — used for preview rendering */
export function getSampleData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const v of EMAIL_VARIABLES) {
    data[v.key] = v.sampleValue;
  }
  return data;
}
