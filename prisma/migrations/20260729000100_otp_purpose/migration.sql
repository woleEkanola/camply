-- Adds OTP.purpose and swaps the PK from (email) to (email, purpose), so
-- login, password-reset, and staff-signup codes for the same email can no
-- longer silently clobber or authorize one another.

-- The DEFAULT backfills every existing row to 'LOGIN' as part of adding the
-- NOT NULL column — Postgres applies the default to existing rows in the
-- same statement, no separate UPDATE needed. 'LOGIN' is the correct default
-- for pre-existing rows: PASSWORD_RESET/STAFF_SIGNUP codes are short-lived
-- (10 min `expiresAt`) and consumed immediately by their own route, so any
-- row surviving to this migration is overwhelmingly a login code (or already
-- expired and functionally inert either way).
ALTER TABLE "OTP" ADD COLUMN IF NOT EXISTS "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN';

-- Idempotent by checking pg_constraint directly rather than relying on a
-- specific exception name — after the old (email)-only PK is dropped, the
-- table briefly has no PK at all, and "already has the right PK" vs.
-- "genuinely broken" are different failure shapes best told apart by
-- inspecting the catalog rather than guessing an errcode.
DO $$
DECLARE
  pk_cols text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO pk_cols
  FROM pg_constraint c
  JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.conrelid = '"OTP"'::regclass AND c.contype = 'p'
  GROUP BY c.conname;

  IF pk_cols IS NULL THEN
    ALTER TABLE "OTP" ADD CONSTRAINT "OTP_pkey" PRIMARY KEY ("email", "purpose");
  ELSIF pk_cols = 'email' THEN
    ALTER TABLE "OTP" DROP CONSTRAINT "OTP_pkey";
    ALTER TABLE "OTP" ADD CONSTRAINT "OTP_pkey" PRIMARY KEY ("email", "purpose");
  END IF;
  -- pk_cols already 'email,purpose': nothing to do.
END $$;
