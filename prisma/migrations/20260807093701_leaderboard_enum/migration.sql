-- Split into its own migration (ahead of the leaderboard tables migration)
-- per this repo's enum-before-use convention (see the OtpPurpose split).
-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScoreSource" AS ENUM ('AUTO', 'MANUAL', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
