import React, { useId } from 'react';
import type { MonthlyEntry, OilChangeRecord } from '../taxiTypes';
import { EXPENSE_FIELD_LABELS, REPORT_EXPENSE_KEYS } from '../taxiTypes';
import { paymentSlotLabelForCycle } from '../utils/taxiRentSchedule';
import { formatNumber } from '../utils/taxiFormat';
import { computeEntry, paymentStatusBadgeClass } from '../utils/taxiCalculations';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

const fmt = formatNumber;

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
  highlight?: 'green' | 'red' | 'orange' | 'default';
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, highlight = 'default' }) => {
  const valueClass =
    highlight === 'green'
      ? 'text-green-700'
      : highlight === 'red'
        ? 'text-red-600'
        : highlight === 'orange'
          ? 'text-orange-700'
          : 'text-slate-800';
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
};

export interface MonthlyEntryConfirmModalProps {
  open: boolean;
  entry: MonthlyEntry | null;
  guarantee: number;
  oilChanges?: OilChangeRecord[];
  paymentMode?: 'advance' | 'deferred';
  vehicleSettings?: {
    driverFirstPaymentDate?: string;
    paymentCycleEpoch?: number;
  };
  isEditMode: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

const MonthlyEntryConfirmModal: React.FC<MonthlyEntryConfirmModalProps> = ({
  open,
  entry,
  guarantee,
  oilChanges = [],
  paymentMode = 'advance',
  vehicleSettings,
  isEditMode,
  onConfirm,
  onBack,
}) => {
  const titleId = useId();
  const descId = useId();

  if (!open || !entry) return null;

  const computed = computeEntry(entry, guarantee, oilChanges, paymentMode, vehicleSettings);
  const expenseItems = REPORT_EXPENSE_KEYS.filter((k) => computed.expenseDetails[k] > 0);

  return (
    <AppModal
      open={open}
      onClose={onBack}
      size="md"
      zIndex={100}
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <AppModalHeader>
        <h2 id={titleId} className="text-lg font-bold text-slate-800">
          {isEditMode ? 'تأكيد التعديل' : 'تأكيد دفع الضمان'}
        </h2>
        <p id={descId} className="text-sm text-slate-500 mt-1">
          راجع البيانات قبل {isEditMode ? 'حفظ التعديلات' : 'الإضافة'}
        </p>
      </AppModalHeader>

      <AppModalBody>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-1">
          <SummaryRow label="الشهر" value={computed.month} />
          <SummaryRow label="السائق" value={computed.driverName} />
          <SummaryRow label="الإيراد" value={`${fmt(computed.revenue)} د.أ`} highlight="green" />
          <SummaryRow
            label="المصاريف"
            value={`${fmt(computed.expenses)} د.أ`}
            highlight={computed.expenses > 0 ? 'orange' : 'default'}
          />
          {expenseItems.length > 0 && (
            <div className="py-2 border-b border-slate-100 space-y-1">
              {expenseItems.map((key) => (
                <div key={key} className="flex justify-between text-xs text-slate-500 gap-4">
                  <span className="tabular-nums">{fmt(computed.expenseDetails[key])} د.أ</span>
                  <span>{EXPENSE_FIELD_LABELS[key]}</span>
                </div>
              ))}
            </div>
          )}
          <div className="py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600 mb-2">
              دفعات السائق — {computed.rentSchedule.slotCount} استحقاق
            </p>
            {Array.from({ length: computed.rentSchedule.slotCount }, (_, idx) => {
              const label = paymentSlotLabelForCycle(
                idx,
                computed.paymentCycle.dueDatesInMonth
              );
              return (
                <div key={`${label}-${idx}`} className="flex justify-between text-xs gap-4 py-1">
                  <span className="tabular-nums font-medium text-slate-800">
                    {fmt(computed.driverPayments[idx])} / {fmt(computed.installmentTargets[idx])}{' '}
                    د.أ
                  </span>
                  <span className="text-slate-500 tabular-nums">{label}</span>
                </div>
              );
            })}
          </div>
          <SummaryRow label="مجموع المدفوع" value={`${fmt(computed.driverPaid)} د.أ`} />
          <SummaryRow
            label="المطلوب (دورة ١٠ أيام)"
            value={`${fmt(computed.totalDue)} د.أ`}
          />
          {computed.paymentCycle.periodHint && (
            <p className="text-[11px] text-slate-500 pb-2 leading-relaxed">
              {computed.paymentCycle.periodHint}
            </p>
          )}
          <SummaryRow
            label="المتبقي"
            value={`${fmt(computed.remaining)} د.أ`}
            highlight={computed.remaining > 0 ? 'red' : 'green'}
          />
          {computed.paymentComplete && computed.remaining > 0 && (
            <SummaryRow
              label="تسديد يدوي"
              value={<span className="text-emerald-700 text-xs font-bold">مكتمل (يدوي)</span>}
            />
          )}
          <SummaryRow
            label="الحالة"
            value={
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${paymentStatusBadgeClass(computed.status)}`}
              >
                {computed.status}
              </span>
            }
          />
          <SummaryRow
            label="صافي الشهر"
            value={`${fmt(computed.net)} د.أ`}
            highlight={computed.net >= 0 ? 'green' : 'red'}
          />
        </div>
        {computed.notes?.trim() && (
          <p className="mt-3 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <span className="font-medium text-amber-800">ملاحظات: </span>
            {computed.notes}
          </p>
        )}
      </AppModalBody>

      <AppModalFooter>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            رجوع للتعديل
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-bold ${
              isEditMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isEditMode ? 'تأكيد حفظ التعديلات' : 'تأكيد الإضافة'}
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
};

export default MonthlyEntryConfirmModal;
