/**
 * F6 – Driver Settlement Screen
 *
 * Displays the complete financial settlement for a specific driver:
 * monthly guarantee, amount paid, current month remaining, previous balance,
 * total outstanding, payment history, and current status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { fetchDriverSettlement } from '../utils/taxiApi';
import type { DriverSettlement, DriverProfile } from '../taxiTypes';
import type { VehicleDriver } from '../utils/taxiApi';

interface Props {
  vehicleId: string;
  vehicleLabel: string;
  drivers: VehicleDriver[];
  defaultGuarantee: number;
  language?: 'ar' | 'en';
  onClose: () => void;
}

const L = {
  ar: {
    title: 'تسوية السائق',
    selectDriver: 'اختر السائق',
    noDrivers: 'لا يوجد سائقون مسجلون',
    guarantee: 'الضمان الشهري',
    paid: 'المبلغ المدفوع',
    currentRemaining: 'المتبقي من الشهر الحالي',
    previousBalance: 'الرصيد السابق المتراكم',
    totalOutstanding: 'إجمالي المستحق',
    paymentHistory: 'سجل الدفعات',
    status: 'الحالة',
    active: 'نشط',
    withdrawn: 'منتهي الخدمة',
    settled: 'مسوّى',
    date: 'التاريخ',
    month: 'الشهر',
    amount: 'المبلغ',
    loading: 'جارٍ التحميل…',
    error: 'حدث خطأ أثناء تحميل البيانات',
    noHistory: 'لا يوجد سجل دفعات',
    currency: 'د.أ',
    close: 'إغلاق',
  },
  en: {
    title: 'Driver Settlement',
    selectDriver: 'Select Driver',
    noDrivers: 'No drivers registered',
    guarantee: 'Monthly Guarantee',
    paid: 'Amount Paid',
    currentRemaining: 'Current Month Remaining',
    previousBalance: 'Previous Carried Balance',
    totalOutstanding: 'Total Outstanding',
    paymentHistory: 'Payment History',
    status: 'Status',
    active: 'Active',
    withdrawn: 'Withdrawn',
    settled: 'Settled',
    date: 'Date',
    month: 'Month',
    amount: 'Amount',
    loading: 'Loading…',
    error: 'Failed to load data',
    noHistory: 'No payment history',
    currency: 'JOD',
    close: 'Close',
  },
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const t = L[lang];
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: t.active, cls: 'bg-green-100 text-green-800' },
    withdrawn: { label: t.withdrawn, cls: 'bg-gray-100 text-gray-700' },
    settled: { label: t.settled, cls: 'bg-blue-100 text-blue-800' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' | 'success' | 'warn' }) {
  const toneClass = {
    default: 'border-gray-200 bg-white',
    danger: 'border-red-200 bg-red-50',
    success: 'border-green-200 bg-green-50',
    warn: 'border-amber-200 bg-amber-50',
  }[tone];
  const valueClass = {
    default: 'text-gray-900',
    danger: 'text-red-700',
    success: 'text-green-700',
    warn: 'text-amber-700',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

export default function DriverSettlementScreen({
  vehicleId,
  vehicleLabel,
  drivers,
  defaultGuarantee,
  language = 'ar',
  onClose,
}: Props) {
  const t = L[language];
  const isRtl = language === 'ar';

  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id ?? '');
  const [settlement, setSettlement] = useState<DriverSettlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettlement = useCallback(async (driverId: string) => {
    if (!driverId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDriverSettlement(vehicleId, driverId);
      setSettlement(data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, t.error]);

  useEffect(() => {
    if (selectedDriverId) loadSettlement(selectedDriverId);
  }, [selectedDriverId, loadSettlement]);

  const dir = isRtl ? 'rtl' : 'ltr';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      dir={dir}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
            <p className="text-sm text-gray-500">{vehicleLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Driver selector */}
        <div className="px-6 py-3 border-b border-gray-50">
          {drivers.length === 0 ? (
            <p className="text-sm text-gray-400">{t.noDrivers}</p>
          ) : (
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>{t.selectDriver}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.endDate ? `(${d.endDate})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-gray-400">{t.loading}</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && settlement && (
            <>
              {/* Driver name + status */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-sm">
                  {settlement.driver.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{settlement.driver.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={settlement.currentStatus} lang={language} />
                    {settlement.driver.phoneNumber && (
                      <span className="text-xs text-gray-400">{settlement.driver.phoneNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <SummaryCard
                  label={t.guarantee}
                  value={`${fmt(settlement.monthlyGuarantee)} ${t.currency}`}
                />
                <SummaryCard
                  label={t.paid}
                  value={`${fmt(settlement.amountPaid)} ${t.currency}`}
                  tone="success"
                />
                <SummaryCard
                  label={t.currentRemaining}
                  value={`${fmt(settlement.currentMonthRemaining)} ${t.currency}`}
                  tone={settlement.currentMonthRemaining > 0 ? 'warn' : 'success'}
                />
                <SummaryCard
                  label={t.previousBalance}
                  value={`${fmt(settlement.previousBalance)} ${t.currency}`}
                  tone={settlement.previousBalance > 0 ? 'warn' : 'default'}
                />
              </div>

              {/* Total outstanding — prominent */}
              <div className={`rounded-xl border-2 p-4 mb-5 flex items-center justify-between ${
                settlement.totalOutstanding > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'
              }`}>
                <span className="font-medium text-gray-700">{t.totalOutstanding}</span>
                <span className={`text-xl font-bold ${settlement.totalOutstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {fmt(settlement.totalOutstanding)} {t.currency}
                </span>
              </div>

              {/* Payment history */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t.paymentHistory}</h3>
                {settlement.paymentHistory.length === 0 ? (
                  <p className="text-sm text-gray-400">{t.noHistory}</p>
                ) : (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-start text-xs text-gray-500 font-medium">{t.date}</th>
                          <th className="px-3 py-2 text-start text-xs text-gray-500 font-medium">{t.month}</th>
                          <th className="px-3 py-2 text-end text-xs text-gray-500 font-medium">{t.amount}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlement.paymentHistory.map((p, i) => (
                          <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-700">{p.date}</td>
                            <td className="px-3 py-2 text-gray-500">{p.month}</td>
                            <td className="px-3 py-2 text-end font-medium text-green-700">
                              +{fmt(p.amount)} {t.currency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
