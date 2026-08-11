-- Data-only: backfills every existing TribePointsLog row into ScoreEvent so
-- the legacy manual-award ledger and the new one are a single history from
-- day one. idempotencyKey is "legacy:tpl:<id>" (unique), so this migration
-- is safe to re-run/resume — ON CONFLICT DO NOTHING makes re-application a
-- no-op rather than a duplicate award. TribePointsLog itself is left in
-- place (frozen, not dropped) per the expand/contract rule; its rows are
-- read, never mutated. TribePointsLog has no campId/organizationId of its
-- own, so this joins through Tribe.campId to get one.
--
-- categoryId points at the generic "Special Recognition" seed category — the
-- original TribePointsLog.reason free-text is preserved verbatim in
-- ScoreEvent.reason, so no award context is lost, just re-homed under a
-- category rather than left uncategorized.

INSERT INTO "ScoreEvent"
  ("id", "campId", "tribeId", "categoryId", "points", "reason", "source", "occurredAt", "day", "createdById", "idempotencyKey", "createdAt")
SELECT
  'legacy-se-' || tpl."id",
  t."campId",
  tpl."tribeId",
  'seed-cat-special-recognition',
  tpl."delta",
  tpl."reason",
  'MANUAL',
  tpl."createdAt",
  tpl."createdAt"::date,
  tpl."actorId",
  'legacy:tpl:' || tpl."id",
  tpl."createdAt"
FROM "TribePointsLog" tpl
JOIN "Tribe" t ON t."id" = tpl."tribeId"
ON CONFLICT ("idempotencyKey") DO NOTHING;
