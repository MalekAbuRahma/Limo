/**
 * Tests for driver ledger business logic:
 * - F1: Running outstanding balance
 * - F2: Mid-month proration
 * - F9: ROI now uses owner income (driverPaid), not passenger revenue
 */

import { strictEqual, ok, deepStrictEqual } from 'assert';

// Import utility directly (tsx will resolve .ts)
const {
  dailyRate,
  calculateProratedGuarantee,
  daysBetweenInclusive,
  calculateDriverRunningBalance,
  calculateWithdrawal,
  buildDriverSettlementFromEntries,
} = await import('../utils/taxiDriverLedger.js').catch(async () => {
  // fallback to tsx-resolved .ts
  return import('../utils/taxiDriverLedger.ts');
});

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Daily Rate ────────────────────────────────────────────────────────────────

console.log('\n[Daily Rate]');

test('750 JOD → 25 JOD/day', () => {
  strictEqual(dailyRate(750), 25);
});

test('700 JOD → 23 JOD/day (rounds)', () => {
  strictEqual(dailyRate(700), 23); // 700/30 = 23.33 → 23
});

test('900 JOD → 30 JOD/day', () => {
  strictEqual(dailyRate(900), 30);
});

// ─── Days Between ─────────────────────────────────────────────────────────────

console.log('\n[Days Between Inclusive]');

test('2025-05-01 → 2025-05-12 = 12 days', () => {
  strictEqual(daysBetweenInclusive('2025-05-01', '2025-05-12'), 12);
});

test('same day = 1', () => {
  strictEqual(daysBetweenInclusive('2025-05-01', '2025-05-01'), 1);
});

test('2025-05-13 → 2025-05-31 = 19 days', () => {
  strictEqual(daysBetweenInclusive('2025-05-13', '2025-05-31'), 19);
});

// ─── Prorated Guarantee ────────────────────────────────────────────────────────

console.log('\n[Prorated Guarantee]');

test('Driver A: 12 days × 25 = 300 JOD', () => {
  strictEqual(calculateProratedGuarantee(750, 12), 300);
});

test('Driver B: 19 days × 25 = 475 JOD', () => {
  strictEqual(calculateProratedGuarantee(750, 19), 475);
});

test('Full month (30 days) = 750 JOD', () => {
  strictEqual(calculateProratedGuarantee(750, 30), 750);
});

// ─── Running Balance ──────────────────────────────────────────────────────────

console.log('\n[Running Balance]');

test('May: 750 due, 500 paid → 250 outstanding', () => {
  const result = calculateDriverRunningBalance([
    { month: '2025-05', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 500 },
  ]);
  strictEqual(result.currentOutstandingBalance, 250);
});

test('June carries May balance: 250 + 750 - 600 = 400', () => {
  const result = calculateDriverRunningBalance([
    { month: '2025-05', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 500 },
    { month: '2025-06', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 600 },
  ]);
  strictEqual(result.currentOutstandingBalance, 400);
  strictEqual(result.ledger[1].openingBalance, 250);
  strictEqual(result.ledger[1].closingBalance, 400);
});

test('Balance follows driver to different vehicle', () => {
  const result = calculateDriverRunningBalance([
    { month: '2025-05', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 500 },
    { month: '2025-06', vehicleId: 'v2', proratedGuarantee: 750, paymentsReceived: 750 }, // paid in full
    { month: '2025-07', vehicleId: 'v2', proratedGuarantee: 750, paymentsReceived: 500 },
  ]);
  // May: 250 outstanding → June: 250+750-750 = 250 → July: 250+750-500 = 500
  strictEqual(result.currentOutstandingBalance, 500);
  strictEqual(result.ledger.length, 3);
});

test('Fully paid → 0 balance', () => {
  const result = calculateDriverRunningBalance([
    { month: '2025-05', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 750 },
    { month: '2025-06', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 750 },
  ]);
  strictEqual(result.currentOutstandingBalance, 0);
});

test('Balance never goes negative (over-payment clamped)', () => {
  const result = calculateDriverRunningBalance([
    { month: '2025-05', vehicleId: 'v1', proratedGuarantee: 750, paymentsReceived: 1000 },
  ]);
  strictEqual(result.currentOutstandingBalance, 0);
});

// ─── Driver Withdrawal ────────────────────────────────────────────────────────

console.log('\n[Driver Withdrawal]');

test('12-day withdrawal: 12 × 25 = 300 prorated', () => {
  const r = calculateWithdrawal({
    vehicleId: 'v1',
    driverId: 'd1',
    startDate: '2025-05-01',
    endDate: '2025-05-12',
    monthlyGuarantee: 750,
    paymentsReceived: 200,
    previousBalance: 0,
  });
  strictEqual(r.daysWorked, 12);
  strictEqual(r.proratedGuarantee, 300);
  strictEqual(r.remainingBalance, 100); // 0 + 300 - 200
});

test('Suggested next anchor = end date + 1', () => {
  const r = calculateWithdrawal({
    vehicleId: 'v1',
    driverId: 'd1',
    startDate: '2025-05-01',
    endDate: '2025-05-12',
    monthlyGuarantee: 750,
    paymentsReceived: 0,
    previousBalance: 0,
  });
  strictEqual(r.suggestedNextAnchorDate, '2025-05-13');
});

test('Previous balance carries into withdrawal', () => {
  const r = calculateWithdrawal({
    vehicleId: 'v1',
    driverId: 'd1',
    startDate: '2025-06-01',
    endDate: '2025-06-15',
    monthlyGuarantee: 750,
    paymentsReceived: 100,
    previousBalance: 250, // from May
  });
  // 15 days × 25 = 375; 250 + 375 - 100 = 525
  strictEqual(r.daysWorked, 15);
  strictEqual(r.proratedGuarantee, 375);
  strictEqual(r.remainingBalance, 525);
});

// ─── Settlement from Entries ──────────────────────────────────────────────────

console.log('\n[Settlement from Entries]');

test('3-month settlement: totals accumulate', () => {
  const entries = [
    { id: 'e1', date: '2025-03-01', month: 'مارس 2025', driverPaid: 600, monthlyGuarantee: 750 },
    { id: 'e2', date: '2025-04-01', month: 'أبريل 2025', driverPaid: 750, monthlyGuarantee: 750 },
    { id: 'e3', date: '2025-05-01', month: 'مايو 2025', driverPaid: 500, monthlyGuarantee: 750 },
  ];
  const result = buildDriverSettlementFromEntries(entries, 750);
  strictEqual(result.totalGuaranteeDue, 2250);
  strictEqual(result.totalPaid, 1850);
  strictEqual(result.totalOutstanding, 400);
  strictEqual(result.ledger.length, 3);
});

// ─── F9: ROI uses driverPaid not revenue ──────────────────────────────────────

console.log('\n[F9: ROI calculation fix]');

const { computeEntry, computeDashboard, computeRoiAnalysis } = await import('../utils/taxiCalculations.js').catch(async () => {
  return import('../utils/taxiCalculations.ts');
});

test('computeDashboard netProfit uses driverPaid not revenue', () => {
  const entries = [{
    id: 'e1',
    date: '2025-05-01',
    month: 'مايو 2025',
    driverName: 'أحمد',
    revenue: 2000,       // passenger revenue — NOT used for profitability
    expenses: 0,
    expenseDetails: { office: 0, insurance: 0, oil: 0, maintenance: 0, accident: 0, commission: 0, other: 0 },
    driverPaid: 750,
    driverPayments: [750, 0, 0],
    paymentComplete: true,
    monthlyGuarantee: 750,
  }];
  const result = computeDashboard(entries, 750, []);
  // The critical invariant: totalRevenue is tracked but NOT used for profitability
  strictEqual(result.totalRevenue, 2000);
  // netProfit must be based on owner income (driverPaid), not passenger revenue
  ok(result.netProfit !== 2000, 'netProfit must NOT equal passenger revenue (2000)');
  // totalOwnerIncome must exist and not equal passenger revenue
  ok('totalOwnerIncome' in result, 'should have totalOwnerIncome field');
  ok(result.totalOwnerIncome !== 2000, 'totalOwnerIncome must not equal passenger revenue');
  // netProfit = totalOwnerIncome - totalExpenses
  strictEqual(result.netProfit, result.totalOwnerIncome - result.totalExpenses);
});

test('totalNormalExpenses and totalMajorExpenses fields exist', () => {
  const entries = [
    {
      id: 'e1', date: '2025-05-01', month: '2025-05', driverName: 'أحمد',
      revenue: 0, expenses: 100,
      expenseDetails: { office: 100, insurance: 0, oil: 0, maintenance: 0, accident: 0, commission: 0, other: 0 },
      driverPaid: 0, paymentComplete: false, monthlyGuarantee: 750,
      expenseType: 'normal',
    },
    {
      id: 'e2', date: '2025-06-01', month: '2025-06', driverName: 'أحمد',
      revenue: 0, expenses: 500,
      expenseDetails: { office: 0, insurance: 0, oil: 0, maintenance: 500, accident: 0, commission: 0, other: 0 },
      driverPaid: 0, paymentComplete: false, monthlyGuarantee: 750,
      expenseType: 'major',
    },
  ];
  const result = computeDashboard(entries, 750, []);
  ok('totalNormalExpenses' in result, 'should have totalNormalExpenses');
  ok('totalMajorExpenses' in result, 'should have totalMajorExpenses');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} driver ledger tests passed`);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}
