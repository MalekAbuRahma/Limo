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
  resolvePaymentStatus,
  monthKey,
  normalizeExpenseDetails,
  sumExpenses,
} from '../utils/taxiCalculations.ts';
import {
  settleDriverPayments,
  sumDriverPayments,
  computeRentSchedule,
} from '../utils/taxiDriverPayments.ts';
import {
  computeWorkSpan,
  computeProratedDue,
  paymentSlotLabelForCycle,
} from '../utils/taxiRentSchedule.ts';
import {
  generateDueDates,
  formatNextDueHint,
  dueDatesInEntryMonth,
  buildPaymentCycle,
  fixedPeriodAmount,
} from '../utils/taxiPaymentCycle.ts';
import {
  resolvePaymentAnchor,
  isHistoricalEntryMonth,
  isEntryOnPriorPaymentCycle,
  snapshotPaymentAnchorOnSave,
  applyPaymentCycleSettingsPatch,
  requiresFirstPaymentDateSetup,
  isOnlyPaymentDateSettingsPatch,
} from '../utils/taxiPaymentSettings.ts';
import { formatIsoDateDisplay } from '../utils/taxiCalendarIso.ts';
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
assert(getPaymentStatus(150) === 'غير مكتمل', 'incomplete when remaining');
assert(getPaymentStatus(0) === 'مكتمل', 'complete when no remaining');
assert(resolvePaymentStatus(150, false) === 'غير مكتمل', 'remaining not settled');
assert(resolvePaymentStatus(0, false) === 'مكتمل', 'zero remaining settled');
assert(resolvePaymentStatus(150, true) === 'مكتمل', 'manual complete');
assert(
  resolvePaymentStatus(100, false, 200, 300) === 'مدفوع جزئياً',
  'partial when paid but remaining'
);

// legacy expense migration: empty breakdown + total
const migrated = normalizeExpenseDetails({}, 190);
assert(migrated.other === 190, 'legacy expense -> other');
assert(sumExpenses(migrated) === 190, 'legacy sum');

// compute entry net
const entry = computeEntry(
  {
    id: '1',
    date: '2020-05-01',
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
assert(entry.status === 'مدفوع جزئياً', 'entry partial when some paid and remaining');
assert(entry.month === '05/2020', 'computed month label past');

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

// rent schedule: full month June 750 → 3 payments
const juneFull = computeRentSchedule('2026-06-01', 750, 750);
assert(juneFull.totalDue === 750, 'full month due = revenue');
assert(juneFull.slotCount === 3, '3 due dates in June');
assert(juneFull.slotTargets[0] === 250 && juneFull.slotTargets[1] === 250, '250 per 10-day period');
assert(
  juneFull.slotTargets[0] + juneFull.slotTargets[1] + juneFull.slotTargets[2] === 750,
  'slots sum to due'
);
assert(fixedPeriodAmount(750) === 250, 'monthly / 3 accounting periods');

const augCycle = generateDueDates('2026-08-08', { maxCount: 6 }).map(formatIsoDateDisplay);
assert(
  augCycle.join(',') === '08/08/2026,18/08/2026,28/08/2026,08/09/2026,18/09/2026,28/09/2026',
  'anchor day 8, 18, 28 each calendar month (no drift into 07/09)'
);

const may8Preview = generateDueDates('2026-05-08', { maxCount: 6 }).map(formatIsoDateDisplay);
assert(
  may8Preview.join(',') === '08/05/2026,18/05/2026,28/05/2026,08/06/2026,18/06/2026,28/06/2026',
  'settings preview: same anchor days in May and June'
);

const maySched = computeRentSchedule('2026-05-01', 750, 750, '2026-05-22');
assert(maySched.slotCount === 1, 'one due date in May from May 22 anchor');
assert(maySched.totalDue === 250, 'one accounting period = rent/3');

// 3 due dates per month from anchor day 9 (May–June)
const cycleDates = generateDueDates('2026-05-09', {
  from: '2026-05-01',
  to: '2026-06-30',
  maxCount: 6,
});
assert(
  cycleDates.map(formatIsoDateDisplay).join(',') ===
    '09/05/2026,19/05/2026,29/05/2026,09/06/2026,19/06/2026,29/06/2026',
  'anchor day 9, 19, 29 each calendar month'
);
assert(
  formatNextDueHint('2026-05-09') === 'موعد الاستحقاق التالي (+10 أيام): 19/05/2026',
  'next due hint'
);
assert(
  dueDatesInEntryMonth('2026-05-09', '2026-05-01').length === 3,
  'May entry has 3 due dates from May 9 start'
);
assert(
  dueDatesInEntryMonth('2026-05-09', '2026-06-01').length === 3,
  'June entry has 3 due dates continuing cycle'
);

const junePartial = computeRentSchedule('2026-06-01', 750, 750, '2026-06-16');
assert(
  paymentSlotLabelForCycle(0, junePartial.dueDatesInMonth) === '16/06/2026',
  'slot 0 label is first due date'
);
assert(
  paymentSlotLabelForCycle(1, junePartial.dueDatesInMonth) === '26/06/2026',
  'slot 1 label is second due date (+10 days)'
);

const partialEntry = computeEntry(
  {
    id: 'partial',
    date: '2026-06-01',
    month: '',
    driverName: 'Test',
    revenue: 750,
    expenses: 0,
    expenseDetails: {
      office: 0,
      insurance: 0,
      oil: 0,
      maintenance: 0,
      accident: 0,
      commission: 0,
      other: 0,
    },
    driverPayments: [250, 0, 0],
    driverPaid: 250,
  },
  750
);
assert(partialEntry.status === 'مدفوع جزئياً', 'partial payment status');
assert(partialEntry.remaining > 0, 'partial has remaining balance');
assert(
  partialEntry.totalDue === partialEntry.paymentCycle.totalExpected,
  'summary totalDue matches payment cycle'
);
assert(
  partialEntry.remaining === partialEntry.paymentCycle.totalRemaining,
  'summary remaining matches payment cycle'
);
assert(
  partialEntry.driverPaid === partialEntry.paymentCycle.totalPaid,
  'summary paid matches payment cycle'
);

const deferredCycle = buildPaymentCycle({
  entryMonthDate: '2026-06-01',
  monthlyRental: 750,
  firstPaymentDate: '2026-06-01',
  mode: 'deferred',
});
assert(deferredCycle.mode === 'deferred', 'deferred mode');
assert(deferredCycle.periods[0].periodEnd === '2026-05-31', 'deferred first period ends before June');

const capped = settleDriverPayments([1, 1, 1], undefined, '2026-06-01', 750, 750);
assert(sumDriverPayments(capped) === 3, 'partial payment allowed per slot');
const full = settleDriverPayments([250, 250, 250], undefined, '2026-06-01', 750, 750);
assert(sumDriverPayments(full) === 750, 'full installments sum to due');
const over = settleDriverPayments([500, 250, 250], undefined, '2026-06-01', 750, 750);
assert(sumDriverPayments(over) === 750, 'overpayment per slot clamped');
const entryFull = computeEntry(
  {
    id: 'pay-full',
    date: '2026-06-01',
    month: '',
    driverName: 'Test',
    revenue: 750,
    expenses: 0,
    expenseDetails: { office: 0, insurance: 0, oil: 0, maintenance: 0, accident: 0, commission: 0, other: 0 },
    driverPayments: [250, 250, 250],
    driverPaid: 750,
  },
  750
);
assert(entryFull.remaining === 0, 'full payment → no remaining');
assert(entryFull.status === 'مكتمل', 'full payment → complete');

const vehicleSettings = {
  driverFirstPaymentDate: '2026-06-01',
  paymentCycleEpoch: 2,
};
const historicalEntry = {
  date: '2020-05-01',
  paymentAnchorDate: '2020-05-09',
  paymentCycleEpoch: 1,
};
if (isHistoricalEntryMonth('2020-05-01')) {
  assert(
    resolvePaymentAnchor(historicalEntry, vehicleSettings) === '2020-05-09',
    'historical entry keeps saved anchor when settings change'
  );
}
assert(
  resolvePaymentAnchor({ date: '2030-06-01' }, vehicleSettings) === '2026-06-01',
  'future entry uses settings anchor'
);

const priorCycleEntry = {
  date: '2026-06-01',
  paymentAnchorDate: '2026-06-08',
  paymentCycleEpoch: 1,
};
const newCycleSettings = {
  driverFirstPaymentDate: '2026-06-15',
  paymentCycleEpoch: 3,
};
assert(
  isEntryOnPriorPaymentCycle(priorCycleEntry, newCycleSettings),
  'entry epoch below settings epoch'
);
if (!isHistoricalEntryMonth('2026-06-01')) {
  assert(
    resolvePaymentAnchor(priorCycleEntry, newCycleSettings) === '2026-06-08',
    'current-month entry keeps frozen anchor until re-save'
  );
  const rebound = snapshotPaymentAnchorOnSave(
    { id: 'e1', ...priorCycleEntry, month: '', driverName: 'x', revenue: 0, expenses: 0, expenseDetails: {}, driverPayments: [0, 0, 0], driverPaid: 0 },
    { ...newCycleSettings, monthlyGuarantee: 750, currentDriverName: 'x', vehicleLabel: 'v' }
  );
  assert(rebound.paymentAnchorDate === '2026-06-15', 're-save binds entry to new cycle anchor');
  assert(rebound.paymentCycleEpoch === 3, 're-save bumps entry epoch');
}

assert(
  isOnlyPaymentDateSettingsPatch(
    { currentDriverName: 'أ', monthlyGuarantee: 750, paymentCycleEpoch: 1 },
    { currentDriverName: 'أ', monthlyGuarantee: 750, driverFirstPaymentDate: '2026-06-08', paymentCycleEpoch: 1 }
  ),
  'only date patch detected'
);

assert(requiresFirstPaymentDateSetup({}), 'setup required when no anchor');
assert(!requiresFirstPaymentDateSetup({ driverFirstPaymentDate: '2026-08-08' }), 'setup ok when anchor set');
const afterDriverChange = applyPaymentCycleSettingsPatch(
  { currentDriverName: 'أحمد', driverFirstPaymentDate: '2026-08-08', paymentCycleEpoch: 0 },
  { currentDriverName: 'محمد', driverFirstPaymentDate: '2026-08-08', paymentCycleEpoch: 0 }
);
assert(
  !afterDriverChange.driverFirstPaymentDate,
  'driver change clears first payment date for re-entry'
);
assert(afterDriverChange.paymentCycleEpoch === 1, 'driver change bumps cycle epoch');

const mayCycleDue = computeRentSchedule('2026-05-01', 750, 750, '2026-05-22').totalDue;
const entryPartialStart = computeEntry(
  {
    id: 'may-partial',
    date: '2026-05-01',
    paymentAnchorDate: '2026-05-22',
    month: '',
    driverName: 'Test',
    revenue: 750,
    expenses: 0,
    expenseDetails: { office: 0, insurance: 0, oil: 0, maintenance: 0, accident: 0, commission: 0, other: 0 },
    driverPayments: [mayCycleDue, 0, 0],
    driverPaid: mayCycleDue,
  },
  750
);
assert(entryPartialStart.remaining === 0, 'paid cycle amount for May 22 anchor → complete');
assert(maySched.totalDue === mayCycleDue, 'schedule due matches payment cycle');

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
assert(
  withLic.expenseByCategory.insurance === merged.expenseByCategory.insurance + 120,
  'license in expense breakdown'
);
assert(
  merged.expenseByCategory.grandTotal + 120 === withLic.expenseByCategory.grandTotal,
  'license grand total sync'
);
assert(withLic.netProfit === merged.netProfit - 120, 'license reduces net');

assert(getLicenseRenewalDueDate('2025-06-15') === '2026-06-15', 'renewal +1 year');
const overdue = getLicenseRenewalInfo('2024-01-01', new Date('2026-05-01'));
assert(overdue.status === 'overdue', 'past renewal is overdue');

console.log('All calculation tests passed ✓');
