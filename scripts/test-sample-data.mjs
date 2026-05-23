/**
 * Smoke test: 3 years sample data + dashboard/ROI (run: node scripts/test-sample-data.mjs)
 */
import { generateSampleEntries, getSampleSettingsPatch } from '../utils/taxiSampleData.ts';
import {
  computeDashboard,
  computeEntry,
  computeRoiAnalysis,
  monthKey,
} from '../utils/taxiCalculations.ts';
import { formatNumber, formatInteger } from '../utils/taxiFormat.ts';
import { DEFAULT_SETTINGS } from '../taxiTypes.ts';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

const entries = generateSampleEntries(3);
const settings = { ...DEFAULT_SETTINGS, ...getSampleSettingsPatch() };
const guarantee = settings.monthlyGuarantee;

assert(entries.length === 36, `expected 36 months, got ${entries.length}`);

const keys = new Set(entries.map((e) => monthKey(e.date)));
assert(keys.size === 36, 'each month must be unique');

const computed = entries.map((e) => computeEntry(e, guarantee));
const totals = computeDashboard(entries, guarantee);
const roi = computeRoiAnalysis(computed, settings.vehicleCost, settings.vehicleLifeYears);

assert(totals.totalRevenue > 0, 'total revenue > 0');
assert(totals.totalExpenses > 0, 'total expenses > 0');
assert(totals.lateCount > 0, 'should have some late months');
assert(totals.paidCount + totals.lateCount === 36, 'paid + late = 36');
assert(roi.monthsRecorded === 36, 'ROI months recorded');
assert(Number.isFinite(roi.breakEvenMonths) && roi.breakEvenMonths > 0, 'break-even months');
assert(roi.avgMonthlyNet > 0, 'positive avg monthly net');

// English digits in formatted output
const formatted = formatNumber(1234);
assert(!/[٠-٩]/.test(formatted), 'formatNumber must not use Arabic-Indic digits');
assert(formatted.includes('1'), 'formatNumber uses Western digits');

const intFormatted = formatInteger(1100);
assert(intFormatted === '1,100' || intFormatted === '1100', `formatInteger: ${intFormatted}`);

console.log('--- Sample data test report ---');
console.log(`Months: ${formatInteger(entries.length)}`);
console.log(`Total revenue: ${formatNumber(totals.totalRevenue)} JOD`);
console.log(`Total expenses: ${formatNumber(totals.totalExpenses)} JOD`);
console.log(`Net profit: ${formatNumber(totals.netProfit)} JOD`);
console.log(`Paid months: ${formatInteger(totals.paidCount)} | Late: ${formatInteger(totals.lateCount)}`);
console.log(`Avg monthly net: ${formatNumber(roi.avgMonthlyNet)} JOD`);
console.log(`Break-even: ${formatInteger(roi.breakEvenMonths)} months (~${roi.breakEvenDuration})`);
console.log(`Recovers within ${settings.vehicleLifeYears}y: ${roi.recoversWithinLife ? 'yes' : 'no'}`);
console.log('All sample-data tests passed ✓');
