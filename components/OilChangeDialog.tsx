import React, { useEffect, useId, useState } from 'react';
import type { OilChangeRecord } from '../taxiTypes';
import {
  OIL_GRADE_OPTIONS,
  OIL_KM_ALERT_THRESHOLD,
  OIL_DAYS_ALERT_THRESHOLD,
  OIL_SERVICE_INTERVAL_KM,
  OIL_TYPE_OPTIONS,
  suggestNextOdometer,
} from '../utils/taxiOilChange';

export type OilDialogMode = 'entry' | 'standalone';

interface OilChangeDialogProps {
  open: boolean;
  mode: OilDialogMode;
  changeDate: string;
  oilCost: number;
  driverName: string;
  existing?: OilChangeRecord | null;
  previousRecords: OilChangeRecord[];
  onCancel: () => void;
  onSave: (record: OilChangeRecord) => void;
}

const OilChangeDialog: React.FC<OilChangeDialogProps> = ({
  open,
  mode,
  changeDate,
  oilCost,
  driverName,
  existing,
  previousRecords,
  onCancel,
  onSave,
}) => {
  const titleId = useId();
  const [recordDate, setRecordDate] = useState('');
  const [cost, setCost] = useState('');
  const [oilType, setOilType] = useState('');
  const [oilTypeCustom, setOilTypeCustom] = useState('');
  const [oilGrade, setOilGrade] = useState('');
  const [oilGradeCustom, setOilGradeCustom] = useState('');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [nextOdometer, setNextOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nextTouched, setNextTouched] = useState(false);

  const resolveSelect = (
    value: string,
    custom: string,
    options: readonly string[]
  ): string => {
    if (value === 'أخرى') return custom.trim();
    return value.trim();
  };

  const initSelect = (
    stored: string,
    options: readonly string[]
  ): { select: string; custom: string } => {
    const v = stored.trim();
    if (!v) return { select: '', custom: '' };
    if ((options as readonly string[]).includes(v) && v !== 'أخرى') {
      return { select: v, custom: '' };
    }
    return { select: 'أخرى', custom: v };
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNextTouched(Boolean(existing));
    const dateStr = (existing?.changeDate ?? changeDate).slice(0, 10);
    setRecordDate(dateStr);

    if (existing) {
      setCost(String(existing.cost || oilCost || ''));
      const t = initSelect(existing.oilType ?? '', OIL_TYPE_OPTIONS);
      setOilType(t.select);
      setOilTypeCustom(t.custom);
      const g = initSelect(existing.oilGrade ?? '', OIL_GRADE_OPTIONS);
      setOilGrade(g.select);
      setOilGradeCustom(g.custom);
      setCurrentOdometer(String(existing.currentOdometer || ''));
      setDistanceKm(String(existing.distanceKm || ''));
      setNextOdometer(String(existing.nextOdometer || ''));
      setNotes(existing.notes ?? '');
    } else {
      setCost(String(oilCost || ''));
      setOilType('');
      setOilTypeCustom('');
      setOilGrade('');
      setOilGradeCustom('');
      const last = previousRecords[0];
      setCurrentOdometer(last ? String(last.nextOdometer || last.currentOdometer) : '');
      setDistanceKm('');
      const cur = last?.nextOdometer || last?.currentOdometer || 0;
      setNextOdometer(cur > 0 ? String(suggestNextOdometer(cur)) : '');
      setNotes('');
    }
  }, [open, existing, previousRecords, changeDate, oilCost]);

  useEffect(() => {
    if (!open || nextTouched) return;
    const cur = Number(currentOdometer) || 0;
    if (cur > 0) setNextOdometer(String(suggestNextOdometer(cur)));
  }, [currentOdometer, open, nextTouched]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cur = Number(currentOdometer);
    const dist = Number(distanceKm);
    const next = Number(nextOdometer);
    const costNum = mode === 'standalone' ? Number(cost) : oilCost;
    const typeResolved = resolveSelect(oilType, oilTypeCustom, OIL_TYPE_OPTIONS);
    const gradeResolved = resolveSelect(oilGrade, oilGradeCustom, OIL_GRADE_OPTIONS);

    if (!recordDate) {
      setError('أدخل تاريخ تغيير الزيت.');
      return;
    }
    if (!typeResolved) {
      setError('اختر نوع الزيت أو أدخله في «أخرى».');
      return;
    }
    if (!gradeResolved) {
      setError('اختر عيار الزيت (اللزوجة) أو أدخله في «أخرى».');
      return;
    }
    if (!cur || cur <= 0) {
      setError('أدخل العداد الحالي (كم) بشكل صحيح.');
      return;
    }
    if (!dist || dist <= 0) {
      setError('أدخل المسافة المقطوعة (كم) بشكل صحيح.');
      return;
    }
    if (!next || next <= 0) {
      setError('أدخل العداد القادم (كم) بشكل صحيح.');
      return;
    }
    if (next <= cur) {
      setError('العداد القادم يجب أن يكون أكبر من العداد الحالي.');
      return;
    }
    if (mode === 'standalone' && (Number.isNaN(costNum) || costNum < 0)) {
      setError('أدخل تكلفة الزيت بشكل صحيح.');
      return;
    }

    const record: OilChangeRecord = {
      id: existing?.id ?? `oil-${Date.now()}`,
      entryId: existing?.entryId ?? '',
      changeDate: recordDate.slice(0, 10),
      cost: Math.round(costNum),
      oilType: typeResolved,
      oilGrade: gradeResolved,
      currentOdometer: Math.round(cur),
      distanceKm: Math.round(dist),
      nextOdometer: Math.round(next),
      notes: notes.trim(),
    };

    onSave(record);
  };

  const previewAlert = (() => {
    const dist = Number(distanceKm) || 0;
    if (dist <= 0 || previousRecords.length === 0) return null;
    const prev = previousRecords[0];
    const days = Math.round(
      (new Date(`${recordDate.slice(0, 10)}T12:00:00`).getTime() -
        new Date(`${prev.changeDate.slice(0, 10)}T12:00:00`).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    if (dist > OIL_KM_ALERT_THRESHOLD && days > 0 && days < OIL_DAYS_ALERT_THRESHOLD) {
      return `تنبيه: المسافة المقطوعة ${dist.toLocaleString('ar-JO')} كم خلال ${days} يوماً فقط — أقل من شهرين وبأكثر من ${OIL_KM_ALERT_THRESHOLD.toLocaleString('ar-JO')} كم.`;
    }
    return null;
  })();

  const isEntry = mode === 'entry';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
    >
      <form
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 text-right overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-orange-50">
          <h2 id={titleId} className="text-lg font-bold text-orange-900">
            {isEntry ? 'تغيير زيت — بيانات العداد' : existing ? 'تعديل سجل الزيت' : 'تسجيل تغيير زيت'}
          </h2>
          <p className="text-sm text-orange-800 mt-2 leading-relaxed">
            سجّل نوع الزيت والعيار والتكلفة مع قراءات العداد — تُحسب تلقائياً في مصاريف الشهر
            والأرباح والملخص
            {driverName ? ` (${driverName})` : ''}.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {mode === 'standalone' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">تاريخ التغيير</span>
                <input
                  type="date"
                  required
                  value={recordDate}
                  onChange={(e) => {
                    setRecordDate(e.target.value);
                    setError(null);
                  }}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">التكلفة (د.أ)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cost}
                  onChange={(e) => {
                    setCost(e.target.value);
                    setError(null);
                  }}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">نوع الزيت</span>
              <select
                value={oilType}
                onChange={(e) => {
                  setOilType(e.target.value);
                  setError(null);
                }}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
                required={!oilTypeCustom}
              >
                <option value="">— اختر —</option>
                {OIL_TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {oilType === 'أخرى' && (
                <input
                  type="text"
                  value={oilTypeCustom}
                  onChange={(e) => {
                    setOilTypeCustom(e.target.value);
                    setError(null);
                  }}
                  className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="اكتب نوع الزيت"
                  autoFocus
                />
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">العيار (اللزوجة)</span>
              <select
                value={oilGrade}
                onChange={(e) => {
                  setOilGrade(e.target.value);
                  setError(null);
                }}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
              >
                <option value="">— اختر —</option>
                {OIL_GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {oilGrade === 'أخرى' && (
                <input
                  type="text"
                  value={oilGradeCustom}
                  onChange={(e) => {
                    setOilGradeCustom(e.target.value);
                    setError(null);
                  }}
                  className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="مثال: 5W-30"
                />
              )}
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">العداد الحالي (كم)</span>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={currentOdometer}
              onChange={(e) => {
                setCurrentOdometer(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
              placeholder="مثال: 185000"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">المسافة المقطوعة (كم)</span>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={distanceKm}
              onChange={(e) => {
                setDistanceKm(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
              placeholder="منذ آخر تغيير زيت"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">العداد القادم (كم)</span>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={nextOdometer}
              onChange={(e) => {
                setNextOdometer(e.target.value);
                setNextTouched(true);
                setError(null);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
              placeholder={`مثال: الحالي + ${OIL_SERVICE_INTERVAL_KM.toLocaleString('ar-JO')}`}
            />
            <p className="text-xs text-slate-500 mt-1">
              يُقترح تلقائياً: العداد الحالي + {OIL_SERVICE_INTERVAL_KM.toLocaleString('ar-JO')} كم
            </p>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">ملاحظات (اختياري)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="الورشة، فلتر الزيت..."
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}

          {previewAlert && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {previewAlert}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            حفظ السجل
          </button>
        </div>
      </form>
    </div>
  );
};

export default OilChangeDialog;
