/**
 * Driver financial ledger utilities.
 *
 * Core business rules:
 * - Outstanding debt belongs to the driver, not the vehicle or month.
 * - Unpaid balance carries forward indefinitely until settled.
 * - Driver transfers between vehicles do NOT erase outstanding debt.
 * - Mid-month handoffs generate prorated guarantees.
 */

import type { MonthlyEntry, DriverAssignmentEntry } from '../taxiTypes';

// ─── Proration ───────────────────────────────────────────────────────────────

const DAYS_IN_MONTH = 30;

/** Round to nearest integer per the spec: Round(monthlyGuarantee / 30) */
export function dailyRate(monthlyGuarantee: number): number {
  return Math.round(monthlyGuarantee / DAYS_IN_MONTH);
}

/**
 * Prorated guarantee for a partial-month driver assignment.
 *
 * Formula: daysWorked × dailyRate(monthlyGuarantee)
 */
export function calculateProratedGuarantee(
  monthlyGuarantee: number,
  daysWorked: number
): number {
  return daysWorked * dailyRate(monthlyGuarantee);
}

/**
 * Count calendar days between two ISO date strings (inclusive on both ends).
 * e.g. 2025-05-01 → 2025-05-12 = 12 days
 */
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000) + 1);
}

// ─── Running Balance Calculation ─────────────────────────────────────────────

export interface DriverLedgerEntry {
  month: string;
  vehicleId: string;
  vehicleLabel?: string;
  openingBalance: number;
  guaranteeDue: number;
  paymentsReceived: number;
  closingBalance: number;
}

export interface DriverRunningBalanceResult {
  driverId: string;
  currentOutstandingBalance: number;
  ledger: DriverLedgerEntry[];
}

/**
 * Calculate a driver's running outstanding balance across all assignment history.
 *
 * The caller supplies the driver's complete assignment + payment history,
 * sorted oldest-first. This function is pure — no DB calls.
 *
 * Formula per period:
 *   openingBalance + guaranteeDue - paymentsReceived = closingBalance
 */
export function calculateDriverRunningBalance(
  assignments: Array<{
    month: string;
    vehicleId: string;
    vehicleLabel?: string;
    proratedGuarantee: number;
    paymentsReceived: number;
  }>
): DriverRunningBalanceResult {
  const sorted = [...assignments].sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  let runningBalance = 0;
  const ledger: DriverLedgerEntry[] = [];

  for (const row of sorted) {
    const openingBalance = runningBalance;
    const guaranteeDue = row.proratedGuarantee;
    const paymentsReceived = row.paymentsReceived;
    const closingBalance = openingBalance + guaranteeDue - paymentsReceived;

    ledger.push({
      month: row.month,
      vehicleId: row.vehicleId,
      vehicleLabel: row.vehicleLabel,
      openingBalance,
      guaranteeDue,
      paymentsReceived,
      closingBalance,
    });

    runningBalance = closingBalance;
  }

  return {
    driverId: '',
    currentOutstandingBalance: Math.max(0, runningBalance),
    ledger,
  };
}

// ─── Driver Withdrawal ───────────────────────────────────────────────────────

export interface DriverWithdrawalInput {
  vehicleId: string;
  driverId: string;
  /** ISO date on which the driver's last working day falls */
  endDate: string;
  /** ISO date the assignment started */
  startDate: string;
  monthlyGuarantee: number;
  paymentsReceived: number;
  previousBalance: number;
}

export interface DriverWithdrawalResult {
  daysWorked: number;
  dailyRate: number;
  proratedGuarantee: number;
  previousBalance: number;
  paymentsReceived: number;
  remainingBalance: number;
  /** ISO date for the next driver's suggested payment anchor */
  suggestedNextAnchorDate: string;
}

/**
 * Calculate the financial outcome of a mid-month driver withdrawal.
 *
 * This is a pure calculation — the caller is responsible for persisting the
 * result and opening the next driver assignment.
 */
export function calculateWithdrawal(input: DriverWithdrawalInput): DriverWithdrawalResult {
  const daysWorked = daysBetweenInclusive(input.startDate, input.endDate);
  const rate = dailyRate(input.monthlyGuarantee);
  const proratedGuarantee = daysWorked * rate;
  const remaining = input.previousBalance + proratedGuarantee - input.paymentsReceived;

  // Next driver anchor = withdrawal date + 1 day (avoid UTC conversion)
  const suggestedNextAnchorDate = addDaysToDateStr(input.endDate, 1);

  return {
    daysWorked,
    dailyRate: rate,
    proratedGuarantee,
    previousBalance: input.previousBalance,
    paymentsReceived: input.paymentsReceived,
    remainingBalance: Math.max(0, remaining),
    suggestedNextAnchorDate,
  };
}

// ─── Month Assignment Splitting ───────────────────────────────────────────────

/**
 * Given the monthly_entries for a vehicle and their driver assignments,
 * calculate the total paid and prorated guarantee for a specific driver
 * within a specific calendar month.
 */
export function getDriverMonthSummary(
  assignments: DriverAssignmentEntry[],
  driverId: string,
  monthKey: string
): { proratedGuarantee: number; paymentsReceived: number; remainingBalance: number } {
  const relevant = assignments.filter(
    (a) => a.driverId === driverId && toMonthKey(a.startDate) === monthKey
  );
  if (relevant.length === 0) {
    return { proratedGuarantee: 0, paymentsReceived: 0, remainingBalance: 0 };
  }
  return relevant.reduce(
    (acc, a) => ({
      proratedGuarantee: acc.proratedGuarantee + a.proratedGuarantee,
      paymentsReceived: acc.paymentsReceived + a.paymentsReceived,
      remainingBalance: acc.remainingBalance + a.remainingBalance,
    }),
    { proratedGuarantee: 0, paymentsReceived: 0, remainingBalance: 0 }
  );
}

function toMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 7); // YYYY-MM
}

/** Add N calendar days to a YYYY-MM-DD string without timezone conversion. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ─── Settlement Summary ───────────────────────────────────────────────────────

/**
 * Build the full settlement view for a driver from their monthly entry history.
 *
 * entries must be sorted oldest-first. The function accumulates the balance
 * forward across all entries.
 */
export function buildDriverSettlementFromEntries(
  entries: Array<Pick<MonthlyEntry, 'id' | 'date' | 'month' | 'driverPaid' | 'monthlyGuarantee'>>,
  defaultGuarantee: number
): {
  totalGuaranteeDue: number;
  totalPaid: number;
  totalOutstanding: number;
  ledger: Array<{
    entryId: string;
    month: string;
    openingBalance: number;
    guaranteeDue: number;
    paid: number;
    closingBalance: number;
  }>;
} {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let runningBalance = 0;
  let totalGuaranteeDue = 0;
  let totalPaid = 0;
  const ledger: Array<{
    entryId: string;
    month: string;
    openingBalance: number;
    guaranteeDue: number;
    paid: number;
    closingBalance: number;
  }> = [];

  for (const entry of sorted) {
    const guarantee = entry.monthlyGuarantee ?? defaultGuarantee;
    const paid = entry.driverPaid ?? 0;
    const openingBalance = runningBalance;
    const closingBalance = openingBalance + guarantee - paid;

    ledger.push({
      entryId: entry.id,
      month: entry.month || entry.date.slice(0, 7),
      openingBalance,
      guaranteeDue: guarantee,
      paid,
      closingBalance,
    });

    runningBalance = closingBalance;
    totalGuaranteeDue += guarantee;
    totalPaid += paid;
  }

  return {
    totalGuaranteeDue,
    totalPaid,
    totalOutstanding: Math.max(0, runningBalance),
    ledger,
  };
}
