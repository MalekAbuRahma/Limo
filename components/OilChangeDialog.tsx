import React, { useEffect, useId, useState } from 'react';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';
import type { OilChangeRecord } from '../taxiTypes';
import {
  OIL_DEFAULT_DISTANCE_KM,
  OIL_GRADE_OPTIONS,
  OIL_KM_ALERT_THRESHOLD,
  OIL_DAYS_ALERT_THRESHOLD,
  formatNextOdometerFromFields,
} from '../utils/taxiOilChange';
import { fetchVehicleDrivers, type VehicleDriver } from '../utils/taxiApi';

export type OilDialogMode = 'entry' | 'standalone';

interface OilChangeDialogProps {
  open: boolean;
  mode: OilDialogMode;
  changeDate: string;
  oilCost: number;
  driverName: string;
  vehicleId?: string;
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
  vehicleId,
  existing,
  previousRecords,
  onCancel,
  onSave,
}) => {
  const titleId = useId();
  const [recordDate, setRecordDate] = useState('');
  const [cost, setCost] = useState('');
  const [oilType, setOilType] = useState('');
  const [oilGrade, setOilGrade] = useState('');
  const [oilGradeCustom, setOilGradeCustom] = useState('');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [nextOdometer, setNextOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [editDriverName, setEditDriverName] = useState('');
  const [registeredDrivers, setRegisteredDrivers] = useState<VehicleDriver[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load drivers for the vehicle
  useEffect(() => {
    if (!vehicleId) return;
    fetchVehicleDrivers(vehicleId).then((list) => {
      setRegisteredDrivers(list.sort((a, b) => b.startDate.localeCompare(a.startDate)));
    }).catch(() => {});
  }, [vehicleId]);

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
    const dateStr = (existing?.changeDate ?? changeDate).slice(0, 10);
    setRecordDate(dateStr);

    if (existing) {
      setCost(String(existing.cost || oilCost || ''));
      setOilType(existing.oilType ?? '');
      const g = initSelect(existing.oilGrade ?? '', OIL_GRADE_OPTIONS);
      setOilGrade(g.select);
      setOilGradeCustom(g.custom);
      setCurrentOdometer(String(existing.currentOdometer || ''));
      setDistanceKm(String(existing.distanceKm || ''));
      setNextOdometer(String(existing.nextOdometer || ''));
      setNotes(existing.notes ?? '');
      setEditDriverName(existing.driverName ?? driverName ?? '');
    } else {
      setCost(String(oilCost || ''));
      setOilType('');
      setOilGrade('');
      setOilGradeCustom('');
      setEditDriverName(driverName ?? '');
      const last = previousRecords[0];
      const defaultDist = OIL_DEFAULT_DISTANCE_KM;
      if (last) {
        const curFromLast = last.nextOdometer || 0;
        const curStr = curFromLast > 0 ? String(curFromLast) : '';
        setCurrentOdometer(curStr);
        setDistanceKm(String(defaultDist));
        setNextOdometer(
          curFromLast > 0 ? formatNextOdometerFromFields(curStr, String(defaultDist)) : ''
        );
      } else {
        setCurrentOdometer('');
        setDistanceKm(String(defaultDist));
        setNextOdometer('');
      }
      setNotes('');
    }
  }, [open, existing, previousRecords, changeDate, oilCost]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cur = Number(currentOdometer);
    const dist = Number(distanceKm);
    const next = Number(nextOdometer);
    const costNum = mode === 'standalone' ? Number(cost) : oilCost;
    const typeResolved = oilType.trim();
    const gradeResolved = resolveSelect(oilGrade, oilGradeCustom, OIL_GRADE_OPTIONS);

    if (!recordDate) {
      setError('أدخل تاريخ تغيير الزيت.');
      return;
    }
    if (!typeResolved) {
      setError('أدخل نوع الزيت.');
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
    if (mode === 'standalone' && (!String(cost).trim() || Number.isNaN(costNum) || costNum <= 0)) {
      setError('التكلفة (د.أ) حقل إجباري — أدخل مبلغاً أكبر من صفر.');
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
      driverName: editDriverName.trim() || driverName || '',
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
    <AppModal
      open={open}
      onClose={onCancel}
      size="lg"
      zIndex={110}
      panelClassName="border border-slate-200"
      aria-labelledby={titleId}
    >
      <form className="flex flex-col min-h-0 overflow-hidden" onSubmit={handleSubmit}>
        <AppModalHeader variant="warning" className="!bg-orange-50 !border-orange-100">
          <h2 id={titleId} className="text-lg font-bold text-orange-900">
            {isEntry ? 'تغيير زيت — بيانات العداد' : existing ? 'تعديل سجل الزيت' : 'تسجيل تغيير زيت'}
          </h2>
          <p className="text-sm text-orange-800 mt-2 leading-relaxed">
            سجّل نوع الزيت والعيار والتكلفة مع قراءات العداد — تُحسب تلقائياً في مصاريف الشهر والأرباح والملخص.
          </p>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-orange-800 mb-1">السائق</label>
            {registeredDrivers.length > 0 ? (
              <select
                value={editDriverName}
                onChange={(e) => setEditDriverName(e.target.value)}
                className="w-full border border-orange-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">— بدون سائق —</option>
                {Array.from(new Map(registeredDrivers.map(d => [d.name.trim(), d])).values()).map(d => (
                  <option key={d.id} value={d.name}>
                    {d.name}{!d.endDate ? ' ●' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={editDriverName}
                onChange={(e) => setEditDriverName(e.target.value)}
                placeholder="اسم السائق (اختياري)"
                className="w-full border border-orange-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            )}
          </div>
        </AppModalHeader>

        <AppModalBody className="space-y-4">
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
                <span className="text-sm font-medium text-slate-700">
                  التكلفة (د.أ) <span className="text-red-600">*</span>
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={cost}
                  onChange={(e) => {
                    setCost(e.target.value);
                    setError(null);
                  }}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
                  placeholder="مثال: 45"
                  aria-required="true"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">نوع الزيت</span>
              <input
                type="text"
                required
                value={oilType}
                onChange={(e) => {
                  setOilType(e.target.value);
                  setError(null);
                }}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
                placeholder="مثال: تخليقي كامل، نصف تخليقي، معدني..."
              />
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
                const next = e.target.value;
                setCurrentOdometer(next);
                setNextOdometer(formatNextOdometerFromFields(next, distanceKm));
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
                const next = e.target.value;
                setDistanceKm(next);
                setNextOdometer(formatNextOdometerFromFields(currentOdometer, next));
                setError(null);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
              placeholder={`افتراضي ${OIL_DEFAULT_DISTANCE_KM.toLocaleString('ar-JO')} كم`}
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
                setError(null);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tabular-nums"
              placeholder="الحالي + المسافة المقطوعة"
            />
            <p className="text-xs text-slate-500 mt-1">
              يُحسب تلقائياً: العداد الحالي + المسافة المقطوعة (افتراضي{' '}
              {OIL_DEFAULT_DISTANCE_KM.toLocaleString('ar-JO')} كم — قابل للتعديل)
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
        </AppModalBody>

        <AppModalFooter>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-3">
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
        </AppModalFooter>
      </form>
    </AppModal>
  );
};

export default OilChangeDialog;
