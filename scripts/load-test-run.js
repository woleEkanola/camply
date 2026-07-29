/**
 * load-test-run.js
 * Fires real HTTP requests against a running app (default
 * http://localhost:3001) to simulate ~1000 campers being scanned through
 * check-in, breakfast, lunch, dinner and checkout, each phase followed by
 * intentional duplicate re-scans (mimicking a volunteer re-scanning a badge
 * by mistake). Requires scripts/load-test-seed.js to have run first
 * (reads .loadtest-fixtures.json).
 *
 * Usage: node scripts/load-test-run.js
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { encode } = require("next-auth/jwt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE_URL = process.env.LOADTEST_BASE_URL || "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
const DUPLICATE_RATE = 0.15; // 15% of each phase gets an intentional re-scan

if (!SECRET) throw new Error("NEXTAUTH_SECRET not set (check .env)");

const manifestPath = path.join(__dirname, "..", ".loadtest-fixtures.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error("Run `node scripts/load-test-seed.js` first — .loadtest-fixtures.json not found.");
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function mintCookie(userId, email) {
  const token = {
    sub: userId,
    id: userId,
    email,
    role: "VOLUNTEER",
    organizationId: manifest.organizationId,
    managedCampuses: [],
  };
  const jwt = await encode({ token, secret: SECRET, maxAge: 30 * 24 * 60 * 60 });
  return `next-auth.session-token=${jwt}`;
}

async function scan(cookie, body) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/trpc/scan.processScan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ json: body }),
    });
    const latency = Date.now() - start;
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg = payload?.error?.json?.message || `HTTP ${res.status}`;
      return { ok: false, latency, status: res.status, error: errMsg };
    }
    const result = payload?.result?.data?.json?.result;
    return { ok: true, latency, status: res.status, result };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, status: 0, error: e.message };
  }
}

/** Runs `items` through `makeBody(reg)` across `stations`, one in-flight
 * request per station at a time (concurrency == stations.length), and
 * returns aggregated stats. */
async function runPhase(name, items, stations, makeBody) {
  const stats = { name, total: items.length, byResult: {}, latencies: [], errors: [] };
  const perStation = stations.map(() => []);
  items.forEach((item, i) => perStation[i % stations.length].push(item));

  const wallStart = Date.now();
  await Promise.all(
    perStation.map(async (queue, si) => {
      const cookie = stations[si].cookie;
      for (const item of queue) {
        const res = await scan(cookie, makeBody(item));
        stats.latencies.push(res.latency);
        if (!res.ok) {
          stats.byResult["TRANSPORT_ERROR"] = (stats.byResult["TRANSPORT_ERROR"] || 0) + 1;
          stats.errors.push(res.error);
        } else {
          const key = res.result || "UNKNOWN";
          stats.byResult[key] = (stats.byResult[key] || 0) + 1;
        }
      }
    })
  );
  const wallMs = Date.now() - wallStart;
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  console.log(`\n=== Phase: ${name} ===`);
  console.log(`  requests: ${stats.total} in ${wallMs}ms (${(stats.total / (wallMs / 1000)).toFixed(1)} req/s)`);
  console.log(`  results: ${JSON.stringify(stats.byResult)}`);
  console.log(`  latency ms — p50:${percentile(sorted, 50)} p95:${percentile(sorted, 95)} p99:${percentile(sorted, 99)} max:${sorted[sorted.length - 1] || 0}`);
  if (stats.errors.length) console.log(`  sample errors: ${stats.errors.slice(0, 5).join(" | ")}`);
  return stats;
}

function sample(arr, rate) {
  const n = Math.round(arr.length * rate);
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function main() {
  console.log(`Target: ${BASE_URL} | Campers: ${manifest.registrations.length} | Stations: ${manifest.stations.length}`);

  const stations = [];
  for (const s of manifest.stations) {
    stations.push({ ...s, cookie: await mintCookie(s.userId, s.email) });
  }

  const regs = manifest.registrations;
  const allStats = [];

  // ── 1. CHECK-IN (arrival) ──
  allStats.push(
    await runPhase("check-in", regs, stations, (reg) => ({
      organizationId: manifest.organizationId,
      qrToken: reg.qrToken,
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    }))
  );
  const checkinDupes = sample(regs, DUPLICATE_RATE);
  allStats.push(
    await runPhase("check-in (duplicates)", checkinDupes, stations, (reg) => ({
      organizationId: manifest.organizationId,
      qrToken: reg.qrToken,
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    }))
  );

  // ── 2/3/4. MEALS ──
  for (const [meal, label] of [["BREAKFAST", "Breakfast"], ["LUNCH", "Lunch"], ["DINNER", "Dinner"]]) {
    allStats.push(
      await runPhase(label, regs, stations, (reg) => ({
        organizationId: manifest.organizationId,
        qrToken: reg.qrToken,
        station: label,
        stationId: meal,
      }))
    );
    const dupes = sample(regs, DUPLICATE_RATE);
    allStats.push(
      await runPhase(`${label} (duplicates)`, dupes, stations, (reg) => ({
        organizationId: manifest.organizationId,
        qrToken: reg.qrToken,
        station: label,
        stationId: meal,
      }))
    );
  }

  // ── 5. CHECKOUT ──
  allStats.push(
    await runPhase("checkout", regs, stations, (reg) => ({
      organizationId: manifest.organizationId,
      qrToken: reg.qrToken,
      station: "Checkout",
      stationId: "CHECKOUT",
      checkoutDetails: { collectorName: "Load Test Parent", collectorRelationship: "Parent" },
    }))
  );
  const checkoutDupes = sample(regs, DUPLICATE_RATE);
  allStats.push(
    await runPhase("checkout (duplicates)", checkoutDupes, stations, (reg) => ({
      organizationId: manifest.organizationId,
      qrToken: reg.qrToken,
      station: "Checkout",
      stationId: "CHECKOUT",
      checkoutDetails: { collectorName: "Load Test Parent", collectorRelationship: "Parent" },
    }))
  );

  // ── DB invariant checks ──
  console.log("\n=== DB invariant checks ===");
  const regIds = regs.map((r) => r.id);
  const [breakfastCount, lunchCount, dinnerCount, checkedOutCount, dupScanCount, totalScanCount] = await Promise.all([
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "BREAKFAST" } }),
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "LUNCH" } }),
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "DINNER" } }),
    prisma.registration.count({ where: { id: { in: regIds }, checkedOutAt: { not: null } } }),
    prisma.scanEvent.count({ where: { registrationId: { in: regIds }, result: "DUPLICATE" } }),
    prisma.scanEvent.count({ where: { registrationId: { in: regIds } } }),
  ]);
  console.log(`  mealDistribution rows — breakfast:${breakfastCount} lunch:${lunchCount} dinner:${dinnerCount} (expected ${regs.length} each — no double-serves despite duplicate scans)`);
  console.log(`  registrations checked out: ${checkedOutCount} (expected ${regs.length})`);
  console.log(`  DUPLICATE scan events logged: ${dupScanCount}`);
  console.log(`  total scan events: ${totalScanCount}`);

  const invariantsOk =
    breakfastCount === regs.length &&
    lunchCount === regs.length &&
    dinnerCount === regs.length &&
    checkedOutCount === regs.length;
  console.log(`\nINVARIANTS: ${invariantsOk ? "PASS" : "FAIL"}`);

  const reportPath = path.join(__dirname, "..", ".loadtest-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ allStats, invariantsOk, breakfastCount, lunchCount, dinnerCount, checkedOutCount, dupScanCount, totalScanCount }, null, 2));
  console.log(`Report written: ${reportPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
