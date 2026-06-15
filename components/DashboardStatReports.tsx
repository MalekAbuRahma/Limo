import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  EXPENSE_FIELD_LABELS,
  REPORT_EXPENSE_KEYS,
} from '../taxiTypes';
import { formatNumber, formatInteger } from '../utils/taxiFormat';
import type { EntryComputed, DashboardTotals } from '../utils/taxiCalculations';
import { paymentStatusBadgeClass } from '../utils/taxiCalculations';
import type { AccidentSummary } from '../utils/taxiAccidents';
import type { LicenseSummary } from '../utils/taxiLicenses';

const fmt = formatNumber;
const fmtInt = formatInteger;

export type DashboardReportType = 'revenue' | 'expenses' | 'net' | 'paid' | 'remaining';

const MONTH_AR: Record<string, string> = {
  '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
  '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
};

function fmtMonth(d: string) {
  const [y, m] = d.split('-');
  return `${MONTH_AR[m] ?? m} ${y}`;
}

function sortEntries(entries: EntryComputed[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Shared shell ─────────────────────────────────────────────────────────────

function ReportShell({
  title,
  subtitle,
  theme,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  theme: 'green' | 'orange' | 'blue' | 'slate' | 'red';
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const themeMap = {
    green: { border: 'border-green-100', icon: 'bg-green-100 text-green-600' },
    orange: { border: 'border-orange-100', icon: 'bg-orange-100 text-orange-600' },
    blue: { border: 'border-blue-100', icon: 'bg-blue-100 text-blue-600' },
    slate: { border: 'border-slate-200', icon: 'bg-slate-100 text-slate-600' },
    red: { border: 'border-red-100', icon: 'bg-red-100 text-red-600' },
  };
  const t = themeMap[theme];

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center pt-8 pb-6 px-3"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.icon}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-auto flex-1 p-4 space-y-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function SummaryChip({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center min-w-[100px]">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

function RevenueReport({ entries, onClose }: { entries: EntryComputed[]; onClose: () => void }) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const total = sorted.reduce((s, e) => s + e.revenue, 0);

  return (
    <ReportShell
      title="تقرير الإيرادات الشهرية"
      subtitle={`${sorted.length} شهر — مجموع الإيرادات: ${fmt(total)} د.أ`}
      theme="green"
      onClose={onClose}
      footer="الإيراد = ما أُدخل في عمود الإيراد لكل شهر (إيراد الرحلات وليس مدفوعات الضمان)"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-green-50 text-xs font-semibold text-slate-600">
            <th className="px-3 py-2 text-right">#</th>
            <th className="px-3 py-2 text-right">الشهر</th>
            <th className="px-3 py-2 text-right">السائق</th>
            <th className="px-3 py-2 text-left">الإيراد</th>
            <th className="px-3 py-2 text-left">المصاريف</th>
            <th className="px-3 py-2 text-left">صافي الشهر</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e, i) => (
            <tr key={e.id} className={i % 2 ? 'bg-slate-50/60' : ''}>
              <td className="px-3 py-2 text-xs text-slate-400">{sorted.length - i}</td>
              <td className="px-3 py-2 font-medium">{fmtMonth(e.date)}</td>
              <td className="px-3 py-2 text-slate-600">{e.driverName || '—'}</td>
              <td className="px-3 py-2 tabular-nums text-left text-green-700 font-semibold">{fmt(e.revenue)}</td>
              <td className="px-3 py-2 tabular-nums text-left text-orange-600">{fmt(e.expenses)}</td>
              <td className={`px-3 py-2 tabular-nums text-left font-medium ${e.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                {fmt(e.revenue - e.expenses)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-green-800 text-white text-xs font-bold">
            <td colSpan={3} className="px-3 py-2">الإجمالي</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(total)}</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(sorted.reduce((s, e) => s + e.expenses, 0))}</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(sorted.reduce((s, e) => s + e.revenue - e.expenses, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

function ExpensesReport({
  entries,
  totals,
  baseTotals,
  accidentSummary,
  licenseSummary,
  monthlyExpensesExOil,
  oilInSummary,
  onClose,
}: {
  entries: EntryComputed[];
  totals: DashboardTotals;
  baseTotals: DashboardTotals;
  accidentSummary: AccidentSummary;
  licenseSummary: LicenseSummary;
  monthlyExpensesExOil: number;
  oilInSummary: number;
  onClose: () => void;
}) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const ec = totals.expenseByCategory;

  const extraItems = [
    ...(accidentSummary.totalCost > 0
      ? [{ label: 'إصلاح حوادث', amount: accidentSummary.totalCost }]
      : []),
    ...(licenseSummary.totalPaid > 0
      ? [{ label: 'ترخيص سنوي', amount: licenseSummary.totalPaid }]
      : []),
  ];

  return (
    <ReportShell
      title="تقرير المصاريف التفصيلي"
      subtitle={`إجمالي المصاريف: ${fmt(totals.totalExpenses)} د.أ`}
      theme="orange"
      onClose={onClose}
      footer="المصاريف الشهرية من المتابعة + الزيت + الحوادث + الترخيص حسب الملخص العام"
    >
      <div className="flex flex-wrap gap-2">
        <SummaryChip label="متابعة شهرية" value={`${fmt(monthlyExpensesExOil)} د.أ`} color="text-orange-700" />
        {oilInSummary > 0 && <SummaryChip label="زيت" value={`${fmt(oilInSummary)} د.أ`} color="text-orange-700" />}
        {accidentSummary.totalCost > 0 && (
          <SummaryChip label="حوادث" value={`${fmt(accidentSummary.totalCost)} د.أ`} color="text-orange-700" />
        )}
        {licenseSummary.totalPaid > 0 && (
          <SummaryChip label="ترخيص" value={`${fmt(licenseSummary.totalPaid)} د.أ`} color="text-orange-700" />
        )}
        <SummaryChip label="المجموع" value={`${fmt(totals.totalExpenses)} د.أ`} color="text-orange-800" />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">تفصيل حسب النوع (إجمالي)</p>
        <div className="flex flex-wrap gap-2">
          {REPORT_EXPENSE_KEYS.map((key) => {
            const val = ec[key];
            if (val <= 0) return null;
            return (
              <SummaryChip
                key={key}
                label={key === 'oil' ? 'زيت (تبويب الزيت)' : EXPENSE_FIELD_LABELS[key]}
                value={`${fmt(val)} د.أ`}
              />
            );
          })}
          {extraItems.map((item) => (
            <SummaryChip key={item.label} label={item.label} value={`${fmt(item.amount)} د.أ`} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">مصاريف كل شهر (متابعة شهرية)</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-orange-50 text-xs font-semibold text-slate-600">
              <th className="px-2 py-2 text-right">#</th>
              <th className="px-2 py-2 text-right">الشهر</th>
              <th className="px-2 py-2 text-right">السائق</th>
              {REPORT_EXPENSE_KEYS.map((k) => (
                <th key={k} className="px-2 py-2 text-left">{EXPENSE_FIELD_LABELS[k]}</th>
              ))}
              <th className="px-2 py-2 text-left font-bold">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => (
              <tr key={e.id} className={i % 2 ? 'bg-slate-50/60' : ''}>
                <td className="px-2 py-1.5 text-xs text-slate-400">{sorted.length - i}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtMonth(e.date)}</td>
                <td className="px-2 py-1.5 text-slate-600">{e.driverName || '—'}</td>
                {REPORT_EXPENSE_KEYS.map((k) => (
                  <td key={k} className="px-2 py-1.5 tabular-nums text-left text-orange-700">
                    {e.expenseDetails[k] > 0 ? fmt(e.expenseDetails[k]) : '—'}
                  </td>
                ))}
                <td className="px-2 py-1.5 tabular-nums text-left font-semibold text-orange-800">
                  {fmt(e.expenses)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-800 text-white text-xs font-bold">
              <td colSpan={3} className="px-2 py-2">إجمالي المتابعة الشهرية</td>
              {REPORT_EXPENSE_KEYS.map((k) => (
                <td key={k} className="px-2 py-2 tabular-nums text-left">{fmt(ec[k])}</td>
              ))}
              <td className="px-2 py-2 tabular-nums text-left">{fmt(baseTotals.totalExpenses)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}

// ─── Net profit ───────────────────────────────────────────────────────────────

function NetProfitReport({
  entries,
  totals,
  baseTotals,
  accidentSummary,
  licenseSummary,
  onClose,
}: {
  entries: EntryComputed[];
  totals: DashboardTotals;
  baseTotals: DashboardTotals;
  accidentSummary: AccidentSummary;
  licenseSummary: LicenseSummary;
  onClose: () => void;
}) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const monthlyNet = sorted.reduce((s, e) => s + (e.driverPaid - e.expenses), 0);

  return (
    <ReportShell
      title="تقرير صافي الربح"
      subtitle={`صافي الربح النهائي: ${fmt(totals.netProfit)} د.أ`}
      theme="blue"
      onClose={onClose}
      footer="صافي الربح = مدفوعات السائق (دخل المالك) − المصاريف — مع تعديلات الحوادث والترخيص في الملخص"
    >
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>صافي الشهور (مدفوع − مصاريف)</span>
          <span className="font-semibold tabular-nums">{fmt(baseTotals.netProfit)} د.أ</span>
        </div>
        {accidentSummary.totalCost > 0 && (
          <div className="flex justify-between text-red-700">
            <span>− إصلاح حوادث</span>
            <span className="font-semibold tabular-nums">{fmt(accidentSummary.totalCost)} د.أ</span>
          </div>
        )}
        {accidentSummary.totalInsuranceReceived > 0 && (
          <div className="flex justify-between text-green-700">
            <span>+ تأمين مستلم</span>
            <span className="font-semibold tabular-nums">{fmt(accidentSummary.totalInsuranceReceived)} د.أ</span>
          </div>
        )}
        {licenseSummary.totalPaid > 0 && (
          <div className="flex justify-between text-red-700">
            <span>− ترخيص سنوي</span>
            <span className="font-semibold tabular-nums">{fmt(licenseSummary.totalPaid)} د.أ</span>
          </div>
        )}
        <div className="flex justify-between border-t border-blue-200 pt-2 font-bold text-blue-900">
          <span>= صافي الربح</span>
          <span className="tabular-nums">{fmt(totals.netProfit)} د.أ</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">صافي كل شهر (مدفوع السائق − مصاريف)</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-2 text-right">#</th>
              <th className="px-3 py-2 text-right">الشهر</th>
              <th className="px-3 py-2 text-right">السائق</th>
              <th className="px-3 py-2 text-left">مدفوع السائق</th>
              <th className="px-3 py-2 text-left">مصاريف</th>
              <th className="px-3 py-2 text-left">صافي الشهر</th>
              <th className="px-3 py-2 text-left">إيراد (مرجع)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const monthNet = e.driverPaid - e.expenses;
              return (
                <tr key={e.id} className={i % 2 ? 'bg-slate-50/60' : ''}>
                  <td className="px-3 py-2 text-xs text-slate-400">{sorted.length - i}</td>
                  <td className="px-3 py-2">{fmtMonth(e.date)}</td>
                  <td className="px-3 py-2 text-slate-600">{e.driverName || '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-left text-slate-800">{fmt(e.driverPaid)}</td>
                  <td className="px-3 py-2 tabular-nums text-left text-orange-600">{fmt(e.expenses)}</td>
                  <td className={`px-3 py-2 tabular-nums text-left font-semibold ${monthNet >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {fmt(monthNet)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-left text-slate-400">{fmt(e.revenue)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-800 text-white text-xs font-bold">
              <td colSpan={3} className="px-3 py-2">إجمالي الشهور</td>
              <td className="px-3 py-2 tabular-nums text-left">{fmt(sorted.reduce((s, e) => s + e.driverPaid, 0))}</td>
              <td className="px-3 py-2 tabular-nums text-left">{fmt(sorted.reduce((s, e) => s + e.expenses, 0))}</td>
              <td className="px-3 py-2 tabular-nums text-left">{fmt(monthlyNet)}</td>
              <td className="px-3 py-2 tabular-nums text-left opacity-60">{fmt(sorted.reduce((s, e) => s + e.revenue, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}

// ─── Paid ─────────────────────────────────────────────────────────────────────

function PaidReport({ entries, totals, onClose }: { entries: EntryComputed[]; totals: DashboardTotals; onClose: () => void }) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const withPayment = sorted.filter((e) => e.driverPaid > 0 || e.totalDue > 0);

  return (
    <ReportShell
      title="تقرير المدفوعات والضمان"
      subtitle={`مجموع المدفوع: ${fmt(totals.totalPaid)} د.أ — ${fmtInt(totals.paidCount)} شهر مكتمل`}
      theme="slate"
      onClose={onClose}
      footer="المدفوع = أقساط الضمان المسجّلة (كل ١٠ أيام) — ليس نفس عمود الإيراد"
    >
      <div className="flex flex-wrap gap-2">
        <SummaryChip label="مجموع المدفوع" value={`${fmt(totals.totalPaid)} د.أ`} />
        <SummaryChip label="أشهر مكتملة" value={fmtInt(totals.paidCount)} color="text-green-700" />
        <SummaryChip label="أشهر غير مكتملة" value={fmtInt(totals.lateCount)} color="text-red-600" />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
            <th className="px-2 py-2 text-right">#</th>
            <th className="px-2 py-2 text-right">الشهر</th>
            <th className="px-2 py-2 text-right">السائق</th>
            <th className="px-2 py-2 text-left">ضمان مستحق</th>
            <th className="px-2 py-2 text-left">دفعة ١</th>
            <th className="px-2 py-2 text-left">دفعة ٢</th>
            <th className="px-2 py-2 text-left">دفعة ٣</th>
            <th className="px-2 py-2 text-left font-bold">المدفوع</th>
            <th className="px-2 py-2 text-center">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {(withPayment.length ? withPayment : sorted).map((e, i) => (
            <tr key={e.id} className={i % 2 ? 'bg-slate-50/60' : ''}>
              <td className="px-2 py-2 text-xs text-slate-400">{sorted.length - i}</td>
              <td className="px-2 py-2 whitespace-nowrap">{fmtMonth(e.date)}</td>
              <td className="px-2 py-2 text-slate-600">{e.driverName || '—'}</td>
              <td className="px-2 py-2 tabular-nums text-left text-slate-500">{fmt(e.totalDue)}</td>
              <td className="px-2 py-2 tabular-nums text-left">{fmt(e.driverPayments[0])}</td>
              <td className="px-2 py-2 tabular-nums text-left">{fmt(e.driverPayments[1])}</td>
              <td className="px-2 py-2 tabular-nums text-left">{fmt(e.driverPayments[2])}</td>
              <td className="px-2 py-2 tabular-nums text-left font-semibold text-slate-800">{fmt(e.driverPaid)}</td>
              <td className="px-2 py-2 text-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${paymentStatusBadgeClass(e.status)}`}>
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-800 text-white text-xs font-bold">
            <td colSpan={3} className="px-2 py-2">الإجمالي</td>
            <td className="px-2 py-2 tabular-nums text-left">{fmt(sorted.reduce((s, e) => s + e.totalDue, 0))}</td>
            <td colSpan={3} />
            <td className="px-2 py-2 tabular-nums text-left">{fmt(totals.totalPaid)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}

// ─── Remaining ────────────────────────────────────────────────────────────────

function RemainingReport({ entries, totals, onClose }: { entries: EntryComputed[]; totals: DashboardTotals; onClose: () => void }) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const outstanding = sorted.filter((e) => e.remaining > 0);
  const rows = outstanding.length ? outstanding : sorted.filter((e) => e.totalDue > 0 || e.driverPaid > 0);

  return (
    <ReportShell
      title="تقرير المتبقي والمستحقات"
      subtitle={`مجموع المتبقي: ${fmt(totals.totalRemaining)} د.أ — ${fmtInt(totals.lateCount)} شهر غير مكتمل`}
      theme="red"
      onClose={onClose}
      footer="المتبقي = الضمان المستحق − المدفوع لكل شهر"
    >
      <div className="flex flex-wrap gap-2">
        <SummaryChip label="مجموع المتبقي" value={`${fmt(totals.totalRemaining)} د.أ`} color="text-red-600" />
        <SummaryChip label="أشهر بمتبقي" value={fmtInt(outstanding.length)} color="text-red-600" />
        <SummaryChip label="ضمان مستحق (كل الشهور)" value={`${fmt(sorted.reduce((s, e) => s + e.totalDue, 0))} د.أ`} />
        <SummaryChip label="مدفوع (كل الشهور)" value={`${fmt(totals.totalPaid)} د.أ`} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-red-50 text-xs font-semibold text-slate-600">
            <th className="px-3 py-2 text-right">#</th>
            <th className="px-3 py-2 text-right">الشهر</th>
            <th className="px-3 py-2 text-right">السائق</th>
            <th className="px-3 py-2 text-left">ضمان مستحق</th>
            <th className="px-3 py-2 text-left">مدفوع</th>
            <th className="px-3 py-2 text-left">متبقي</th>
            <th className="px-3 py-2 text-center">الحالة</th>
            <th className="px-3 py-2 text-right">مواعيد الضمان</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.id} className={`${i % 2 ? 'bg-slate-50/60' : ''} ${e.remaining > 0 ? 'bg-red-50/30' : ''}`}>
              <td className="px-3 py-2 text-xs text-slate-400">{rows.length - i}</td>
              <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtMonth(e.date)}</td>
              <td className="px-3 py-2 text-slate-600">{e.driverName || '—'}</td>
              <td className="px-3 py-2 tabular-nums text-left text-slate-700">{fmt(e.totalDue)}</td>
              <td className="px-3 py-2 tabular-nums text-left text-slate-700">{fmt(e.driverPaid)}</td>
              <td className={`px-3 py-2 tabular-nums text-left font-bold ${e.remaining > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {fmt(e.remaining)}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${paymentStatusBadgeClass(e.status)}`}>
                  {e.status}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500 max-w-[140px] truncate" title={e.rentSchedule.dueDatesPreview}>
                {e.rentSchedule.dueDatesPreview || '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-red-800 text-white text-xs font-bold">
            <td colSpan={3} className="px-3 py-2">الإجمالي</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(rows.reduce((s, e) => s + e.totalDue, 0))}</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(rows.reduce((s, e) => s + e.driverPaid, 0))}</td>
            <td className="px-3 py-2 tabular-nums text-left">{fmt(totals.totalRemaining)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export interface DashboardStatReportProps {
  type: DashboardReportType;
  entries: EntryComputed[];
  totals: DashboardTotals;
  baseTotals: DashboardTotals;
  accidentSummary: AccidentSummary;
  licenseSummary: LicenseSummary;
  monthlyExpensesExOil: number;
  oilInSummary: number;
  onClose: () => void;
}

export function DashboardStatReport({
  type,
  entries,
  totals,
  baseTotals,
  accidentSummary,
  licenseSummary,
  monthlyExpensesExOil,
  oilInSummary,
  onClose,
}: DashboardStatReportProps) {
  switch (type) {
    case 'revenue':
      return <RevenueReport entries={entries} onClose={onClose} />;
    case 'expenses':
      return (
        <ExpensesReport
          entries={entries}
          totals={totals}
          baseTotals={baseTotals}
          accidentSummary={accidentSummary}
          licenseSummary={licenseSummary}
          monthlyExpensesExOil={monthlyExpensesExOil}
          oilInSummary={oilInSummary}
          onClose={onClose}
        />
      );
    case 'net':
      return (
        <NetProfitReport
          entries={entries}
          totals={totals}
          baseTotals={baseTotals}
          accidentSummary={accidentSummary}
          licenseSummary={licenseSummary}
          onClose={onClose}
        />
      );
    case 'paid':
      return <PaidReport entries={entries} totals={totals} onClose={onClose} />;
    case 'remaining':
      return <RemainingReport entries={entries} totals={totals} onClose={onClose} />;
    default:
      return null;
  }
}
