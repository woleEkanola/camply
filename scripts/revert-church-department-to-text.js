// One-time data correction, companion to update-registry-fields.js (which
// converted churchDepartment to SELECT with live-populated options — that
// was a mistake, since churchDepartment is the self-reported HOME CHURCH
// department, not the camp Department picker). Reverts existing FormField
// rows back to plain TEXT and clears any stale dynamically-populated
// `options` JSON, matching systemFieldRegistry.ts's corrected definition.
// `ensureSystemFields` only ever inserts missing rows, never updates
// existing ones, so this has to run once against every environment
// (including production) that already has churchDepartment rows from before
// this fix.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Reverting churchDepartment FormField rows to plain TEXT...');
  const res = await prisma.formField.updateMany({
    where: { systemKey: 'churchDepartment', source: 'SYSTEM' },
    data: { type: 'TEXT', options: null },
  });
  console.log(`  Updated ${res.count} churchDepartment field(s) to TEXT.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
