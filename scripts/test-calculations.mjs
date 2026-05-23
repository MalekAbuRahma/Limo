/**
 * Quick smoke tests for taxi calculation logic (run: node scripts/test-calculations.mjs)
 */
import {
  computeEntry,
  computeDashboard,
  computeRoiAnalysis,
  formatMonthLabel,
  formatMonthNumber,
  getPaymentStatus,
  getRemaining,
  monthKey,
  normalizeExpenseDetails,
  sumExpenses,
} from '../utils/taxiCalculations.ts';
import {
  computeAccidentSummary,
  computeClaimBreakdown,
  getDowntimeDailyRate,
  isAwaitingInsurance,
  mergeAccidentsIntoDashboard,
  migrateAccident,
} from '../utils/taxiAccidents.ts';
import {
  computeLicenseSummary,
  getLicenseRenewalDueDate,
  getLicenseRenewalInfo,
  mergeLicensesIntoDashboard,
  migrateLicense,
} from '../utils/taxiLicenses.ts';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

// formatMonthLabel
assert(formatMonthLabel('2026-05-01') === '05/2026', 'month label MM/YYYY');
assert(formatMonthNumber('2026-05-01') === '5', 'month number');

// payment status
assert(getRemaining(750, 600) === 150, 'remaining');
assert(getPaymentStatus(150) === 'متأخر', 'late status');
assert(getPaymentStatus(0) === 'مدفوع', 'paid status');

// legacy expense migration: empty breakdown + total
const migrated = normalizeExpenseDetails({}, 190);
assert(migrated.other === 190, 'legacy expense -> other');
assert(sumExpenses(migrated) === 190, 'legacy sum');

// compute entry net
const entry = computeEntry(
  {
    id: '1',
    date: '2026-05-01',
    month: '',
    driverName: 'Test',
    revenue: 750,
    expenses: 190,
    expenseDetails: migrated,
    driverPaid: 250,
  },
  750
);
assert(entry.net === 560, 'net profit');
assert(entry.status === 'متأخر', 'entry late');
assert(entry.month === '05/2026', 'computed month label');

// dashboard
const dash = computeDashboard([entry], 750);
assert(dash.netProfit === 560, 'dashboard net');
assert(dash.expenseByCategory.grandTotal === 190, 'expense totals');

// ROI
const roi = computeRoiAnalysis([entry], 33000, 7);
assert(roi.breakEvenMonths === 59, 'break even months'); // ceil(33000/560)
assert(roi.recoversWithinLife === true, 'recovers within 7 years');
assert(roi.lifeMonths === 84, 'life months');

// month key duplicate detection
assert(monthKey('2026-05-01') === monthKey('2026-05-15'), 'same month key');

// accidents → dashboard merge
const accidents = [
  migrateAccident({
    id: 'a1',
    accidentDate: '2026-01-01',
    cost: 100,
    insuranceReceived: 40,
    downtimeDays: 2,
  }),
];
const accSum = computeAccidentSummary(dash.netProfit, accidents, 750);
assert(accSum.totalCost === 100, 'accident repair total');
assert(accSum.totalDowntimeDays === 2, 'downtime total');
assert(accSum.downtimeDailyRate === 25, 'daily rate from guarantee 750');
const claim = computeClaimBreakdown(accidents[0], 25);
assert(claim.downtimeAmount === 50, '2 days * 25');
assert(claim.totalClaim === 150, 'downtime + repair');
assert(accSum.totalClaimAmount === 150, 'total claim sum');
assert(accSum.totalPending === 0, 'received insurance not pending');
const pendingOnly = computeAccidentSummary(
  0,
  [
    migrateAccident({ id: 'p1', accidentDate: '2026-01-01', cost: 1000, insuranceReceived: 0 }),
    migrateAccident({ id: 'p2', accidentDate: '2026-01-02', cost: 0, insuranceReceived: 600 }),
  ],
  750
);
assert(pendingOnly.totalPending === 1, 'one awaiting insurance');
assert(getDowntimeDailyRate(750) === 25, '750/30 daily rate');
assert(
  isAwaitingInsurance({
    id: 'x',
    accidentDate: '2026-01-01',
    responsibleDriver: '',
    downtimeDays: 0,
    details: '',
    cost: 100,
    insurancePending: 0,
    insuranceReceived: 0,
  }),
  'zero received is awaiting'
);
assert(accSum.adjustedNetProfit === dash.netProfit - 100 + 40, 'adjusted net');
const merged = mergeAccidentsIntoDashboard(dash, accSum);
assert(merged.totalExpenses === dash.totalExpenses + 100, 'expenses include repair');
assert(merged.netProfit === dash.netProfit - 100 + 40, 'net: − إصلاح + تأمين');

const licSum = computeLicenseSummary([
  migrateLicense({
    id: 'l1',
    licenseDate: '2025-01-01',
    licenseYear: 2025,
    amountPaid: 120,
    notes: 'test',
  }),
]);
const withLic = mergeLicensesIntoDashboard(merged, licSum);
assert(withLic.totalExpenses === merged.totalExpenses + 120, 'license in expenses');
assert(withLic.netProfit === merged.netProfit - 120, 'license reduces net');

assert(getLicenseRenewalDueDate('2025-06-15') === '2026-06-15', 'renewal +1 year');
const overdue = getLicenseRenewalInfo('2024-01-01', new Date('2026-05-01'));
assert(overdue.status === 'overdue', 'past renewal is overdue');

console.log('All calculation tests passed ✓');
