import React, { useMemo, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import type { MonthlyEntry, OilChangeRecord } from '../taxiTypes';
import { formatInteger, formatNumber } from '../utils/taxiFormat';
import {
  OIL_DAYS_ALERT_THRESHOLD,
  OIL_KM_ALERT_THRESHOLD,
  OIL_SERVICE_INTERVAL_KM,
  getOilChangeAlert,
  sortOilChangesNewestFirst,
  sumOilChangeCosts,
} from '../utils/taxiOilChange';

const fmt = formatNumber;
const fmtInt = formatInteger;

interface OilMaintenanceTabProps {
  oilChanges: OilChangeRecord[];
  entries: MonthlyEntry[];
  onEditRecord: (record: OilChangeRecord) => void;
  onAddRecord: () => void;
  onDeleteRecord: (id: string) => void;
}

const OilMaintenanceTab: React.FC<OilMaintenanceTabProps> = ({
  oilChanges,
  entries,
  onEditRecord,
  onAddRecord,
  onDeleteRecord,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingRecord = pendingDeleteId
    ? oilChanges.find((r) => r.id === pendingDeleteId)
    : undefined;

  const sorted = useMemo(() => sortOilChangesNewestFirst(oilChanges), [oilChanges]);
  const latest = sorted[0] ?? null;
  const alert = useMemo(() => getOilChangeAlert(oilChanges), [oilChanges]);

  const entryMonthById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.id, e.month || e.date.slice(0, 7));
    return m;
  }, [entries]);

  const kmUntilNext =
    latest && latest.nextOdometer > latest.currentOdometer
      ? latest.nextOdometer - latest.currentOdometer
      : null;

  const totalOilCost = sumOilChangeCosts(oilChanges);

  return (
    <div className="oil-maintenance-tab space-y-6">
      <ConfirmDialog
        open={pendingDeleteId != null}
        title="تأكيد حذف سجل الزيت"
        message={
          pendingRecord ? (
            <>
              هل أنت متأكد من حذف سجل الزيت بتاريخ{' '}
              <strong className="tabular-nums">{pendingRecord.changeDate}</strong>
              {pendingRecord.cost > 0 ? (
                <>
                  {' '}
                  (تكلفة <strong className="tabular-nums">{fmt(pendingRecord.cost)}</strong> د.أ)
                </>
              ) : null}
              ؟
            </>
          ) : (
            'هل أنت متأكد من حذف هذا السجل؟'
          )
        }
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) onDeleteRecord(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="oil-tab-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </span>
            متابعة الزيت والعداد
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
            سجل نوع الزيت والعيار والتكلفة مع قراءات العداد — تُحسب تلقائياً في مصاريف الشهر
            والأرباح والملخص.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRecord}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 shadow-sm"
        >
          + تسجيل تغيير زيت
        </button>
      </div>

      {alert && (
        <div className="oil-alert-banner" role="alert">
          <span className="oil-alert-banner-icon" aria-hidden>
            ⚠
          </span>
          <div>
            <p className="font-semibold text-amber-900">تنبيه مسافة عالية</p>
            <p className="text-sm text-amber-800 mt-1">{alert.message}</p>
          </div>
        </div>
      )}

      <div className="oil-summary-grid">
        <div className="oil-summary-card oil-summary-card--primary">
          <p className="oil-summary-label">آخر تغيير</p>
          <p className="oil-summary-value tabular-nums">{latest?.changeDate ?? '—'}</p>
          {latest?.oilType && (
            <p className="oil-summary-sub text-orange-800 font-medium mt-1">
              {latest.oilType}
              {latest.oilGrade ? ` · ${latest.oilGrade}` : ''}
            </p>
          )}
        </div>
        <div className="oil-summary-card">
          <p className="oil-summary-label">العداد الحالي</p>
          <p className="oil-summary-value tabular-nums text-blue-700">
            {latest ? `${fmtInt(latest.currentOdometer)} كم` : '—'}
          </p>
        </div>
        <div className="oil-summary-card">
          <p className="oil-summary-label">العداد القادم</p>
          <p className="oil-summary-value tabular-nums text-green-700">
            {latest ? `${fmtInt(latest.nextOdometer)} كم` : '—'}
          </p>
          {kmUntilNext != null && kmUntilNext > 0 && (
            <p className="oil-summary-sub mt-1">متبقي ~{fmtInt(kmUntilNext)} كم</p>
          )}
        </div>
        <div className="oil-summary-card">
          <p className="oil-summary-label">المسافة المقطوعة</p>
          <p className="oil-summary-value tabular-nums">
            {latest ? `${fmtInt(latest.distanceKm)} كم` : '—'}
          </p>
        </div>
        <div className="oil-summary-card oil-summary-card--cost">
          <p className="oil-summary-label">إجمالي التكلفة</p>
          <p className="oil-summary-value tabular-nums text-orange-700">
            {totalOilCost > 0 ? `${fmt(totalOilCost)} د.أ` : '—'}
          </p>
          <p className="oil-summary-sub mt-1">يُحسب في تبويب الملخص</p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        معيار التنبيه: أكثر من {fmtInt(OIL_KM_ALERT_THRESHOLD)} كم في أقل من{' '}
        {fmtInt(OIL_DAYS_ALERT_THRESHOLD)} يوماً (~شهرين). الفترة المقترحة بين التغييرات:{' '}
        {fmtInt(OIL_SERVICE_INTERVAL_KM)} كم.
      </p>

      {sorted.length === 0 ? (
        <div className="oil-empty-state">
          <p className="text-slate-600 font-medium">لا توجد سجلات زيت بعد</p>
          <p className="text-sm text-slate-500 mt-2">
            أضف مصروف «زيت» في المتابعة الشهرية، أو استخدم «تسجيل تغيير زيت» أعلاه.
          </p>
        </div>
      ) : (
        <div className="oil-table-wrap">
          <table className="oil-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع الزيت</th>
                <th>العيار</th>
                <th>الحالي</th>
                <th>المسافة</th>
                <th>القادم</th>
                <th>التكلفة</th>
                <th>الشهر</th>
                <th aria-label="إجراءات" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums whitespace-nowrap">{r.changeDate}</td>
                  <td>{r.oilType || '—'}</td>
                  <td className="tabular-nums font-medium">{r.oilGrade || '—'}</td>
                  <td className="tabular-nums">{fmtInt(r.currentOdometer)}</td>
                  <td className="tabular-nums">{fmtInt(r.distanceKm)}</td>
                  <td className="tabular-nums text-green-700 font-medium">
                    {fmtInt(r.nextOdometer)}
                  </td>
                  <td className="tabular-nums">{fmt(r.cost)}</td>
                  <td className="text-xs text-slate-500">
                    {r.entryId ? entryMonthById.get(r.entryId) ?? '—' : 'يدوي'}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-center">
                      <button
                        type="button"
                        onClick={() => onEditRecord(r)}
                        className="oil-row-btn oil-row-btn--edit"
                        title="تعديل"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(r.id)}
                        className="oil-row-btn oil-row-btn--delete"
                        title="حذف"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OilMaintenanceTab;
