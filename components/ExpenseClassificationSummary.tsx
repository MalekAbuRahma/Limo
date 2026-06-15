/**
 * F5 – Expense Classification Summary
 *
 * Dashboard component that displays:
 * - Total Normal Expenses
 * - Total Major Expenses
 * - Alert for large major expenses
 */

import React from 'react';
import type { ExpenseType } from '../taxiTypes';

interface Props {
  totalNormalExpenses: number;
  totalMajorExpenses: number;
  majorExpenseAlertThreshold?: number;
  language?: 'ar' | 'en';
}

const L = {
  ar: {
    normalExpenses: 'مصاريف عادية',
    majorExpenses: 'مصاريف رئيسية',
    normalDesc: 'زيت، غسيل، صيانة بسيطة',
    majorDesc: 'محرك، جير، حادث كبير',
    alert: 'تنبيه: مصاريف رئيسية مرتفعة',
    alertDesc: (amount: number) => `إجمالي المصاريف الرئيسية ${amount.toLocaleString('en-US')} د.أ — يُنصح بالمراجعة`,
    currency: 'د.أ',
  },
  en: {
    normalExpenses: 'Normal Expenses',
    majorExpenses: 'Major Expenses',
    normalDesc: 'Oil, wash, minor service',
    majorDesc: 'Engine, gearbox, major accident',
    alert: 'Alert: High Major Expenses',
    alertDesc: (amount: number) => `Total major expenses ${amount.toLocaleString('en-US')} JOD — review recommended`,
    currency: 'JOD',
  },
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ExpenseClassificationSummary({
  totalNormalExpenses,
  totalMajorExpenses,
  majorExpenseAlertThreshold = 500,
  language = 'ar',
}: Props) {
  const t = L[language];
  const showAlert = totalMajorExpenses >= majorExpenseAlertThreshold;

  return (
    <div className="space-y-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {showAlert && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">{t.alert}</p>
            <p className="text-xs text-red-600 mt-0.5">{t.alertDesc(totalMajorExpenses)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs font-medium text-gray-500">{t.normalExpenses}</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {fmt(totalNormalExpenses)}
            <span className="text-sm font-normal text-gray-400 ms-1">{t.currency}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{t.normalDesc}</p>
        </div>

        <div className={`rounded-xl border p-4 ${
          showAlert ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${showAlert ? 'bg-red-400' : 'bg-orange-400'}`} />
            <span className={`text-xs font-medium ${showAlert ? 'text-red-600' : 'text-gray-500'}`}>
              {t.majorExpenses}
            </span>
          </div>
          <p className={`text-xl font-bold ${showAlert ? 'text-red-700' : 'text-gray-900'}`}>
            {fmt(totalMajorExpenses)}
            <span className="text-sm font-normal text-gray-400 ms-1">{t.currency}</span>
          </p>
          <p className={`text-xs mt-1 ${showAlert ? 'text-red-500' : 'text-gray-400'}`}>{t.majorDesc}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Expense Type Selector ─────────────────────────────────────────────────────

interface ExpenseTypeSelectorProps {
  value: ExpenseType;
  onChange: (type: ExpenseType) => void;
  language?: 'ar' | 'en';
  disabled?: boolean;
}

const TYPE_LABELS = {
  ar: { normal: 'عادي', major: 'رئيسي' },
  en: { normal: 'Normal', major: 'Major' },
};

export function ExpenseTypeSelector({ value, onChange, language = 'ar', disabled }: ExpenseTypeSelectorProps) {
  const labels = TYPE_LABELS[language];
  return (
    <div className="flex gap-2" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {(['normal', 'major'] as ExpenseType[]).map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onChange(type)}
          className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            value === type
              ? type === 'normal'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-red-50 border-red-300 text-red-700'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {labels[type]}
        </button>
      ))}
    </div>
  );
}
