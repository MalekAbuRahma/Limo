/**
 * Backfill historical monthly entries that came across the SQLite→Postgres
 * migration WITHOUT a guarantee / payment-cycle, so they no longer show as
 * "مكتمل" with المدفوع 0.
 *
 * For every HISTORICAL entry (month before the current month) whose
 * monthly_guarantee is NULL or 0, this script:
 *   - sets monthly_guarantee   = the vehicle's monthly_guarantee
 *   - sets payment_anchor_date = the entry's own month start (YYYY-MM-01)
 *     → produces 3 ten-day installments inside that month
 *   - sets payment_cycle_epoch = the vehicle's payment_cycle_epoch
 *   - marks it fully SETTLED:
 *       driver_payment_1/2/3 = guarantee split (e.g. 250/250/250)
 *       driver_paid          = guarantee
 *       payment_complete     = TRUE
 *
 * SAFE BY DEFAULT: runs as a dry-run and only prints what it WOULD change.
 * Pass --apply to actually write.
 *
 * Usage:
 *   node scripts/backfill-historical-guarantee.mjs            # dry-run
 *   node scripts/backfill-historical-guarantee.mjs --apply    # write changes
 *
 * DATABASE_URL must point at the target database (.env / .env.local).
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initPool, closePool, getPool, getDatabaseLabel } from '../server/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });
config({ path: path.join(__dirname, '../.env.local'), override: true });

const APPLY = process.argv.includes('--apply');

/** First day of the current calendar month, e.g. "2026-06-01" */
function currentMonthStartIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** "2026-03-14" / "2026-03" → "2026-03-01" */
function monthStartIso(dateStr) {
  return `${String(dateStr).slice(0, 7)}-01`;
}

/** Three equal-ish installments summing to the guarantee (last slot absorbs remainder) */
function guaranteeSplit(guarantee) {
  const g = Math.max(0, Math.round(guarantee));
  const base = Math.round(g / 3);
  return [base, base, g - base * 2];
}

async function main() {
  await initPool();
  console.log(`\nDatabase: ${getDatabaseLabel()}`);
  console.log(`Mode:     ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no changes)'}`);

  const pool = getPool();
  const monthStart = currentMonthStartIso();
  console.log(`Targeting historical entries before: ${monthStart}\n`);

  const { rows: vehicles } = await pool.query(
    `SELECT id, label, monthly_guarantee, payment_cycle_epoch FROM vehicles ORDER BY label`
  );

  let totalMatched = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const v of vehicles) {
    const guarantee = Math.round(Number(v.monthly_guarantee) || 0);
    const epoch = Number(v.payment_cycle_epoch) || 0;

    const { rows: entries } = await pool.query(
      `SELECT id, date, month, revenue, monthly_guarantee
         FROM monthly_entries
        WHERE vehicle_id = $1
          AND (monthly_guarantee IS NULL OR monthly_guarantee = 0)
          AND date < $2
        ORDER BY date`,
      [v.id, monthStart]
    );

    if (entries.length === 0) continue;

    console.log(`▸ ${v.label || v.id} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to fix (guarantee ${guarantee})`);

    if (guarantee <= 0) {
      console.log(`  ⚠ vehicle has no positive guarantee — skipping all its entries\n`);
      totalSkipped += entries.length;
      continue;
    }

    const [p1, p2, p3] = guaranteeSplit(guarantee);

    for (const e of entries) {
      totalMatched++;
      const anchor = monthStartIso(e.date);
      console.log(
        `    ${e.month || e.date}  revenue=${Math.round(Number(e.revenue) || 0)}  → guarantee=${guarantee}, paid=${guarantee} (${p1}+${p2}+${p3}), anchor=${anchor}, complete=true`
      );

      if (APPLY) {
        await pool.query(
          `UPDATE monthly_entries
              SET monthly_guarantee  = $1,
                  payment_anchor_date = $2,
                  payment_cycle_epoch = $3,
                  driver_payment_1   = $4,
                  driver_payment_2   = $5,
                  driver_payment_3   = $6,
                  driver_paid        = $7,
                  payment_complete   = TRUE
            WHERE id = $8`,
          [guarantee, anchor, epoch, p1, p2, p3, guarantee, e.id]
        );
        totalUpdated++;
      }
    }
    console.log('');
  }

  console.log('────────────────────────────────────────');
  console.log(`Matched entries : ${totalMatched}`);
  console.log(`Skipped (no veh. guarantee): ${totalSkipped}`);
  if (APPLY) {
    console.log(`Updated entries : ${totalUpdated}`);
    console.log('\n✓ Done. Reload the app to see the corrected months.');
  } else {
    console.log('\nDry-run only — no changes written.');
    console.log('Re-run with --apply to write these changes.');
  }

  await closePool();
}

main().catch(async (err) => {
  console.error('\nBackfill failed:', err.message || err);
  console.error('\nCheck DATABASE_URL in .env / .env.local points to the right database.');
  try {
    await closePool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
