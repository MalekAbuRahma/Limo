/**
 * F3 – Automated Driver Replacement Workflow Dialog
 *
 * When a user assigns a new driver, this dialog:
 * 1. Shows the current driver's end date.
 * 2. Calculates the prorated guarantee for the departing driver.
 * 3. Suggests a payment anchor date for the new driver (prev end + 1 day).
 * 4. Confirms and executes the replacement atomically.
 */

import React, { useState, useEffect } from 'react';
import { replaceDriverApi, withdrawDriverApi } from '../utils/taxiApi';
import { calculateWithdrawal } from '../utils/taxiDriverLedger';
import type { VehicleDriver } from '../utils/taxiApi';

interface Props {
  vehicleId: string;
  vehicleLabel: string;
  activeDriver: VehicleDriver | null;
  monthlyGuarantee: number;
  language?: 'ar' | 'en';
  onSuccess: (result: {
    newDriverId: string;
    newDriverName: string;
    suggestedAnchor: string;
  }) => void;
  onCancel: () => void;
}

const L = {
  ar: {
    title: 'تبديل السائق',
    currentDriver: 'السائق الحالي',
    none: 'لا يوجد',
    endDate: 'تاريخ إنهاء الخدمة',
    daysWorked: 'أيام العمل',
    proratedGuarantee: 'الضمان المحتسب',
    newDriver: 'اسم السائق الجديد',
    newDriverStart: 'تاريخ بداية الخدمة',
    suggestedAnchor: 'تاريخ أول دفعة المقترح',
    acceptSuggested: 'استخدام التاريخ المقترح',
    confirm: 'تأكيد التبديل',
    cancel: 'إلغاء',
    replacing: 'جارٍ التبديل…',
    success: 'تم التبديل بنجاح',
    error: 'حدث خطأ',
    driverNameRequired: 'اسم السائق مطلوب',
    startDateRequired: 'تاريخ البداية مطلوب',
    endDateRequired: 'تاريخ الإنهاء مطلوب',
    currency: 'د.أ',
    previewTitle: 'ملخص التبديل',
    remainingBalance: 'الرصيد المتبقي للسائق الحالي',
    newAnchorNote: 'سيتم تحديث تاريخ أول دفعة للسائق الجديد تلقائياً وسيُزاد رقم دورة الدفع.',
  },
  en: {
    title: 'Replace Driver',
    currentDriver: 'Current Driver',
    none: 'None',
    endDate: 'End Date',
    daysWorked: 'Days Worked',
    proratedGuarantee: 'Prorated Guarantee',
    newDriver: 'New Driver Name',
    newDriverStart: 'New Driver Start Date',
    suggestedAnchor: 'Suggested Payment Anchor',
    acceptSuggested: 'Use suggested date',
    confirm: 'Confirm Replacement',
    cancel: 'Cancel',
    replacing: 'Replacing…',
    success: 'Replacement successful',
    error: 'An error occurred',
    driverNameRequired: 'Driver name is required',
    startDateRequired: 'Start date is required',
    endDateRequired: 'End date is required',
    currency: 'JOD',
    previewTitle: 'Replacement Summary',
    remainingBalance: 'Remaining balance for current driver',
    newAnchorNote: 'The payment anchor date and cycle epoch will be updated automatically.',
  },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextDayIso(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function DriverReplacementDialog({
  vehicleId,
  vehicleLabel,
  activeDriver,
  monthlyGuarantee,
  language = 'ar',
  onSuccess,
  onCancel,
}: Props) {
  const t = L[language];
  const isRtl = language === 'ar';

  const [endDate, setEndDate] = useState(todayIso());
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverStart, setNewDriverStart] = useState('');
  const [anchorDate, setAnchorDate] = useState('');
  const [useSuggested, setUseSuggested] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Calculate preview whenever endDate changes
  const preview = activeDriver
    ? calculateWithdrawal({
        vehicleId,
        driverId: activeDriver.id,
        endDate,
        startDate: activeDriver.startDate,
        monthlyGuarantee,
        paymentsReceived: 0,
        previousBalance: 0,
      })
    : null;

  // Keep anchor in sync with suggestion
  useEffect(() => {
    if (useSuggested && endDate) {
      const suggested = nextDayIso(endDate);
      setNewDriverStart(suggested);
      setAnchorDate(suggested);
    }
  }, [endDate, useSuggested]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (activeDriver && !endDate) errors.endDate = t.endDateRequired;
    if (!newDriverName.trim()) errors.newDriverName = t.driverNameRequired;
    if (!newDriverStart) errors.newDriverStart = t.startDateRequired;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleConfirm() {
    if (!validate()) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const result = await replaceDriverApi(vehicleId, {
        currentDriverId: activeDriver?.id ?? null,
        currentDriverEndDate: activeDriver ? endDate : null,
        newDriverName,
        newDriverStartDate: newDriverStart,
        monthlyGuarantee,
      });
      onSuccess(result);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : t.error);
    } finally {
      setSubmitting(false);
    }
  }

  const fmt = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${t.currency}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500">{vehicleLabel}</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Current driver section */}
          {activeDriver && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-sm font-medium text-amber-800">{t.currentDriver}: {activeDriver.name}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t.endDate}</label>
                <input
                  type="date"
                  value={endDate}
                  min={activeDriver.startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {fieldErrors.endDate && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.endDate}</p>
                )}
              </div>

              {/* Proration preview */}
              {preview && (
                <div className="rounded-lg bg-white border border-amber-100 p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-600">{t.previewTitle}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{t.daysWorked}</span>
                    <span className="font-medium">{preview.daysWorked}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{t.proratedGuarantee}</span>
                    <span className="font-medium text-amber-700">{fmt(preview.proratedGuarantee)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New driver section */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.newDriver}</label>
              <input
                type="text"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                placeholder={t.newDriver}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {fieldErrors.newDriverName && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.newDriverName}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.newDriverStart}</label>
              {activeDriver && (
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSuggested}
                    onChange={(e) => setUseSuggested(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-xs text-gray-600">
                    {t.acceptSuggested}: {preview?.suggestedNextAnchorDate ?? nextDayIso(endDate)}
                  </span>
                </label>
              )}
              <input
                type="date"
                value={newDriverStart}
                onChange={(e) => setNewDriverStart(e.target.value)}
                disabled={useSuggested && !!activeDriver}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              {fieldErrors.newDriverStart && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.newDriverStart}</p>
              )}
            </div>
          </div>

          {/* Info note */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <p className="text-xs text-blue-700">{t.newAnchorNote}</p>
          </div>

          {/* API error */}
          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? t.replacing : t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
