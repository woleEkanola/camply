// Pre-flight scan for the partial unique indexes added in
// prisma/migrations/20260728000000_partial_unique_indexes/migration.sql.
//
// Run this against a database BEFORE applying that migration — a violation
// found here means `migrate deploy` will fail with a unique-violation error
// when it tries to build the index. Duplicates found on a live (production)
// database are a data decision, not something this script resolves: it only
// reports counts and example row ids.
//
// Usage: DATABASE_URL="postgresql://..." node scripts/check-duplicate-constraint-violations.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Each check mirrors one partial unique index: WHERE "deletedAt" IS NULL,
// grouped by the given columns, optionally with an extra `extraWhere` for
// nullable columns in the tuple (Postgres partial unique indexes never treat
// two NULLs as a conflict, so nullable columns must be excluded the same way
// here or this script will report false positives).
const CHECKS = [
  { table: 'Campus', columns: ['organizationId', 'name'] },
  { table: 'Venue', columns: ['campId', 'name'] },
  { table: 'FormField', columns: ['organizationId', 'audience', 'name'] },
  { table: 'Camp', columns: ['organizationId', 'name'] },
  { table: 'Camp', columns: ['organizationId', 'slug'] },
  { table: 'Registration', columns: ['camperId', 'campId'] },
  { table: 'Tribe', columns: ['campId', 'name'] },
  { table: 'Tribe', columns: ['campId', 'code'], extraWhere: '"code" IS NOT NULL' },
  { table: 'StaffProfile', columns: ['userId', 'campId'] },
  { table: 'Department', columns: ['organizationId', 'campId', 'name'] },
  { table: 'Hostel', columns: ['venueId', 'name'] },
  { table: 'Room', columns: ['hostelId', 'name'] },
  { table: 'Bed', columns: ['roomId', 'label'] },
];

async function main() {
  let totalViolations = 0;

  for (const check of CHECKS) {
    const colList = check.columns.map((c) => `"${c}"`).join(', ');
    const where = ['"deletedAt" IS NULL', check.extraWhere].filter(Boolean).join(' AND ');

    const groups = await prisma.$queryRawUnsafe(`
      SELECT ${colList}, COUNT(*)::int AS count, array_agg(id) AS ids
      FROM "${check.table}"
      WHERE ${where}
      GROUP BY ${colList}
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

    const label = `${check.table}(${check.columns.join(', ')})`;
    if (groups.length === 0) {
      console.log(`OK    ${label}: no duplicates`);
    } else {
      totalViolations += groups.length;
      console.log(`FAIL  ${label}: ${groups.length} duplicate group(s) (showing up to 20)`);
      for (const g of groups) {
        const keyVals = check.columns.map((c) => `${c}=${g[c]}`).join(' ');
        console.log(`        ${keyVals} count=${g.count} ids=${JSON.stringify(g.ids)}`);
      }
    }
  }

  console.log('');
  if (totalViolations === 0) {
    console.log('All clear — safe to apply the partial unique index migration.');
  } else {
    console.log(`${totalViolations} duplicate group(s) found across all checks — DO NOT apply the migration until these are resolved. This is a data decision for a human, not something to auto-resolve.`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
