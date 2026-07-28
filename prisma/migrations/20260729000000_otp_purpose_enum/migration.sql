-- CreateEnum
-- Split into its own migration (ahead of 20260729000100_otp_purpose) because
-- Postgres requires a new enum value to be committed before it can be used
-- as a column default in the same transaction/session — see CLAUDE.md's
-- migration notes on this exact failure mode.
DO $$ BEGIN
  CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET', 'STAFF_SIGNUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
