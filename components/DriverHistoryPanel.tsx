/**
 * DriverHistoryPanel — full driver registry with inline editing.
 * Columns: #, اسم السائق, من, إلى, الضمان الشهري, actions
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  VehicleDriver,
  fetchVehicleDrivers,
  addVehicleDriverApi,
  stopVehicleDriverApi,
  updateVehicleDriverApi,
  deleteVehicleDriverApi,
} from '../utils/taxiApi';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = new Date(`${start.slice(0, 10)}T12:00:00`);
  const b = new Date(`${end.slice(0, 10)}T12:00:00`);
  const diff = b.getTime() - a.getTime();
  if (diff < 0) return 0;
  return Math.round(diff / (24 * 60 * 60 * 1000)) + 1;
}

interface DriverGap {
  fromDate: string;
  toDate: string;
  days: number;
  afterDriver: string;
  beforeDriver: string;
}

function computeDriverGaps(drivers: VehicleDriver[]): DriverGap[] {
  const sorted = [...drivers].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const gaps: DriverGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    if (!prev.endDate) continue;
    const gapStart = addDaysIso(prev.endDate, 1);
    const gapEnd = addDaysIso(next.startDate, -1);
    if (gapStart <= gapEnd) {
      gaps.push({
        fromDate: gapStart,
        toDate: gapEnd,
        days: daysBetweenInclusive(gapStart, gapEnd),
        afterDriver: prev.name,
        beforeDriver: next.name,
      });
    }
  }
  return gaps;
}

function firstWorkStartDate(drivers: VehicleDriver[]): string | null {
  if (!drivers.length) return null;
  return drivers.reduce(
    (min, d) => (d.startDate < min ? d.startDate : min),
    drivers[0].startDate
  );
}

// ── Inline edit row ───────────────────────────────────────────────────────────

interface EditState {
  name: string;
  startDate: string;
  endDate: string;
  monthlyGuarantee: string;
  notes: string;
}

function toEditState(d: VehicleDriver): EditState {
  return {
    name: d.name,
    startDate: d.startDate,
    endDate: d.endDate ?? '',
    monthlyGuarantee: d.monthlyGuarantee ? String(d.monthlyGuarantee) : '',
    notes: d.notes ?? '',
  };
}

interface DriverRowProps {
  driver: VehicleDriver;
  index: number;
  saving: boolean;
  vehicleGuarantee?: number;
  onSave: (d: VehicleDriver, patch: Partial<VehicleDriver>) => void;
  onStop: (d: VehicleDriver) => void;
  onDelete: (d: VehicleDriver) => void;
}

function DriverRow({ driver, index, saving, vehicleGuarantee, onSave, onStop, onDelete }: DriverRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>(toEditState(driver));
  const isActive = !driver.endDate;

  function startEdit() {
    setDraft(toEditState(driver));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(toEditState(driver));
  }

  function commitEdit() {
    const patch: Partial<VehicleDriver> = {};
    if (draft.name.trim() !== driver.name) patch.name = draft.name.trim();
    if (draft.startDate !== driver.startDate) patch.startDate = draft.startDate;
    const newEnd = draft.endDate.trim() || null;
    if (newEnd !== driver.endDate) patch.endDate = newEnd;
    const newGuarantee = Number(draft.monthlyGuarantee) || 0;
    if (newGuarantee !== driver.monthlyGuarantee) patch.monthlyGuarantee = newGuarantee;
    if (draft.notes !== driver.notes) patch.notes = draft.notes;
    if (!Object.keys(patch).length) { setEditing(false); return; }
    onSave(driver, patch);
    setEditing(false);
  }

  const INPUT = 'border border-slate-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400';

  if (editing) {
    return (
      <tr className="bg-blue-50/60">
        <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{index}</td>
        <td className="px-2 py-1.5">
          <input className={INPUT} value={draft.name}
            onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
            placeholder="اسم السائق" />
        </td>
        <td className="px-2 py-1.5">
          <input type="date" className={INPUT} value={draft.startDate}
            onChange={e => setDraft(p => ({ ...p, startDate: e.target.value }))} />
        </td>
        <td className="px-2 py-1.5">
          <input type="date" className={INPUT} value={draft.endDate}
            onChange={e => setDraft(p => ({ ...p, endDate: e.target.value }))} />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <input type="number" min={0} step={50} className={INPUT + ' w-24'}
              value={draft.monthlyGuarantee}
              onChange={e => setDraft(p => ({ ...p, monthlyGuarantee: e.target.value }))}
              placeholder={vehicleGuarantee ? String(vehicleGuarantee) : '750'} />
            <span className="text-[10px] text-slate-400 shrink-0">د.أ</span>
          </div>
          {!draft.monthlyGuarantee && vehicleGuarantee ? (
            <p className="text-[10px] text-slate-400 mt-0.5">افتراضي: {vehicleGuarantee}</p>
          ) : null}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 justify-end">
            <button type="button" disabled={saving} onClick={commitEdit}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              حفظ
            </button>
            <button type="button" onClick={cancelEdit}
              className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">
              إلغاء
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const effectiveGuarantee = driver.monthlyGuarantee || vehicleGuarantee || 0;

  return (
    <tr className={isActive ? 'bg-green-50/60' : 'bg-white hover:bg-slate-50'}>
      <td className="px-3 py-2.5 text-xs text-slate-400 tabular-nums">{index}</td>
      <td className="px-3 py-2.5 font-medium text-slate-800">{driver.name}</td>
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">{fmtDate(driver.startDate)}</td>
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {isActive
          ? <span className="text-green-600 font-medium text-xs">نشط</span>
          : fmtDate(driver.endDate)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-slate-700">
        {effectiveGuarantee > 0 ? (
          <span>
            {effectiveGuarantee.toLocaleString()} د.أ
            {!driver.monthlyGuarantee && <span className="text-[10px] text-slate-400 mr-1">(افتراضي)</span>}
          </span>
        ) : '—'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={startEdit} disabled={saving} title="تعديل"
            className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          {isActive && (
            <button type="button" onClick={() => onStop(driver)} disabled={saving} title="إيقاف"
              className="px-2 py-1 text-[11px] rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
              إيقاف
            </button>
          )}
          <button type="button" onClick={() => onDelete(driver)} disabled={saving} title="حذف"
            className="p-1.5 rounded border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Stop dialog ───────────────────────────────────────────────────────────────

function StopDialog({ driver, onConfirm, onCancel }: {
  driver: VehicleDriver;
  onConfirm: (endDate: string) => void;
  onCancel: () => void;
}) {
  const [endDate, setEndDate] = useState(todayIso());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-bold text-slate-800">إيقاف السائق: {driver.name}</h3>
        <div>
          <label className="block text-sm text-slate-600 mb-1">تاريخ آخر يوم عمل</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">إلغاء</button>
          <button type="button" disabled={!endDate} onClick={() => onConfirm(endDate)}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            تأكيد الإيقاف
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddDriverForm({ suggestedDate, vehicleGuarantee, onSave, onCancel, saving }: {
  suggestedDate?: string;
  vehicleGuarantee?: number;
  onSave: (name: string, startDate: string, endDate: string | null, monthlyGuarantee: number, notes: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(suggestedDate ?? todayIso());
  const [endDate, setEndDate] = useState('');
  const [guarantee, setGuarantee] = useState(vehicleGuarantee ? String(vehicleGuarantee) : '');
  const [notes, setNotes] = useState('');
  const nameErr = !name.trim() ? 'اسم السائق مطلوب' : '';
  const dateErr = !startDate ? 'تاريخ أول دفعة مطلوب' : '';
  const endErr = endDate && startDate && endDate < startDate ? 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' : '';
  const isClosed = !!endDate;

  function submit() {
    if (nameErr || dateErr || endErr) return;
    onSave(name.trim(), startDate, endDate.trim() || null, Number(guarantee) || 0, notes.trim());
  }

  const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isClosed ? 'border-amber-200 bg-amber-50/60' : 'border-blue-200 bg-blue-50/60'}`} dir="rtl">
      <div className="flex items-center gap-2">
        <p className={`text-sm font-semibold ${isClosed ? 'text-amber-900' : 'text-blue-900'}`}>إضافة سائق جديد</p>
        {isClosed && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
            بيانات قديمة (ترحيل)
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">اسم السائق *</label>
          <input className={INPUT} value={name} onChange={e => setName(e.target.value)}
            placeholder="مثال: محمد علي" autoFocus />
          {nameErr && <p className="text-xs text-red-500 mt-0.5">{nameErr}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">تاريخ أول دفعة (من) *</label>
          <input type="date" className={INPUT} value={startDate} onChange={e => setStartDate(e.target.value)} />
          {dateErr && <p className="text-xs text-red-500 mt-0.5">{dateErr}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            تاريخ الانتهاء (إلى)
            <span className="text-slate-400 mr-1">— اتركه فارغاً إذا كان نشطاً</span>
          </label>
          <input type="date" className={INPUT} value={endDate} onChange={e => setEndDate(e.target.value)} />
          {endErr && <p className="text-xs text-red-500 mt-0.5">{endErr}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            الضمان الشهري (د.أ)
            {vehicleGuarantee ? <span className="text-slate-400 mr-1">— افتراضي: {vehicleGuarantee}</span> : null}
          </label>
          <input type="number" min={0} step={50} className={INPUT} value={guarantee}
            onChange={e => setGuarantee(e.target.value)}
            placeholder={vehicleGuarantee ? String(vehicleGuarantee) : '750'} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">ملاحظات (اختياري)</label>
          <input className={INPUT} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="أي ملاحظات..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">إلغاء</button>
        <button type="button" onClick={submit} disabled={saving || !!nameErr || !!dateErr || !!endErr}
          className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 ${isClosed ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {saving ? '...جاري الحفظ' : isClosed ? 'حفظ (بيانات قديمة)' : 'حفظ السائق'}
        </button>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface DriverHistoryPanelProps {
  vehicleId: string;
  vehicleGuarantee?: number;
  onDriversChanged?: (activeDriver: VehicleDriver | null) => void;
  className?: string;
}

export function DriverHistoryPanel({
  vehicleId,
  vehicleGuarantee,
  onDriversChanged,
  className = '',
}: DriverHistoryPanelProps) {
  const [drivers, setDrivers] = useState<VehicleDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopTarget, setStopTarget] = useState<VehicleDriver | null>(null);

  const activeDriver = drivers.find(d => !d.endDate) ?? null;

  const timelineSummary = useMemo(() => {
    const firstStart = firstWorkStartDate(drivers);
    const gaps = computeDriverGaps(drivers);
    const totalIdleDays = gaps.reduce((s, g) => s + g.days, 0);
    return { firstStart, gaps, totalIdleDays };
  }, [drivers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchVehicleDrivers(vehicleId);
      setDrivers(list.sort((a, b) => b.startDate.localeCompare(a.startDate)));
    } catch {
      setError('تعذّر تحميل قائمة السائقين');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => { load(); }, [load]);

  const notify = useCallback((list: VehicleDriver[]) => {
    onDriversChanged?.(list.find(d => !d.endDate) ?? null);
  }, [onDriversChanged]);

  async function handleAdd(name: string, startDate: string, endDate: string | null, monthlyGuarantee: number, notes: string) {
    setSaving(true);
    setError(null);
    try {
      // Pass endDate directly in INSERT so closed/historical drivers skip the active-driver unique index
      const added = await addVehicleDriverApi(vehicleId, { name, startDate, endDate, notes });
      if (added) {
        let final = added;
        if (monthlyGuarantee > 0) {
          const patched = await updateVehicleDriverApi(vehicleId, added.id, { monthlyGuarantee });
          if (patched) final = patched;
        }
        const updated = [...drivers, final].sort((a, b) => b.startDate.localeCompare(a.startDate));
        setDrivers(updated);
        notify(updated);
      }
      setShowAdd(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إضافة السائق');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(driver: VehicleDriver, patch: Partial<VehicleDriver>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateVehicleDriverApi(vehicleId, driver.id, patch);
      if (updated) {
        const newList = drivers.map(d => d.id === updated.id ? updated : d);
        setDrivers(newList);
        notify(newList);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تعديل السائق');
    } finally {
      setSaving(false);
    }
  }

  async function handleStop(endDate: string) {
    if (!stopTarget) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await stopVehicleDriverApi(vehicleId, stopTarget.id, endDate);
      if (updated) {
        const newList = drivers.map(d => d.id === updated.id ? updated : d);
        setDrivers(newList);
        notify(newList);
      }
      setStopTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إيقاف السائق');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(driver: VehicleDriver) {
    if (!confirm(`هل تريد حذف السائق "${driver.name}"؟`)) return;
    setSaving(true);
    try {
      await deleteVehicleDriverApi(vehicleId, driver.id);
      const newList = drivers.filter(d => d.id !== driver.id);
      setDrivers(newList);
      notify(newList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل حذف السائق');
    } finally {
      setSaving(false);
    }
  }

  const suggestedStart = (() => {
    const stopped = drivers.find(d => d.endDate);
    if (!stopped?.endDate) return todayIso();
    const d = new Date(stopped.endDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className={`space-y-3 ${className}`} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">سجل السائقين</h3>
          <p className="text-xs text-slate-500">كل سائق له تاريخ بداية (أول دفعة) وتاريخ نهاية اختياري</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} disabled={showAdd || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <span className="text-base leading-none">+</span>
          إضافة سائق
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {showAdd && (
        <AddDriverForm
          suggestedDate={activeDriver ? todayIso() : suggestedStart}
          vehicleGuarantee={vehicleGuarantee}
          onSave={(name, startDate, endDate, monthlyGuarantee, notes) =>
            handleAdd(name, startDate, endDate, monthlyGuarantee, notes)
          }
          onCancel={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-4 text-center">جاري التحميل...</p>
      ) : drivers.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-500">لا يوجد سائقون مسجّلون</p>
          <p className="text-xs text-slate-400 mt-1">اضغط «إضافة سائق» لتسجيل أول سائق</p>
        </div>
      ) : (
        <>
          {timelineSummary.firstStart && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <p className="text-xs font-semibold text-blue-900">تاريخ بداية العمل الكلي</p>
                </div>
                <p className="text-lg font-bold text-blue-800 tabular-nums">{fmtDate(timelineSummary.firstStart)}</p>
                <p className="text-[11px] text-blue-700/80 mt-0.5">أول يوم بدأت فيه السيارة بالعمل (أقدم سائق مسجّل)</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-xs font-semibold text-amber-900">أيام توقف السيارة</p>
                </div>
                <p className="text-lg font-bold text-amber-800 tabular-nums">
                  {timelineSummary.totalIdleDays > 0
                    ? `${timelineSummary.totalIdleDays} يوم`
                    : 'لا توقف'}
                </p>
                <p className="text-[11px] text-amber-700/80 mt-0.5">
                  {timelineSummary.gaps.length > 0
                    ? `${timelineSummary.gaps.length} فترة بين السائقين`
                    : 'لا توجد فجوات بين فترات السائقين'}
                </p>
              </div>
            </div>
          )}

          {timelineSummary.gaps.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                <p className="text-xs font-semibold text-amber-900">فترات توقف السيارة (بين السائقين)</p>
              </div>
              <ul className="divide-y divide-amber-50">
                {timelineSummary.gaps.map((gap, i) => (
                  <li key={i} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
                        {gap.days}
                      </span>
                      <span className="text-slate-700">
                        <span className="font-medium tabular-nums">{fmtDate(gap.fromDate)}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="font-medium tabular-nums">{fmtDate(gap.toDate)}</span>
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      بين <span className="font-medium text-slate-700">{gap.afterDriver}</span>
                      {' '}و{' '}
                      <span className="font-medium text-slate-700">{gap.beforeDriver}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" dir="rtl">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">#</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">اسم السائق</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">من</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">إلى</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">الضمان الشهري</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((d, i) => (
                <DriverRow
                  key={d.id}
                  driver={d}
                  index={drivers.length - i}
                  saving={saving}
                  vehicleGuarantee={vehicleGuarantee}
                  onSave={handleUpdate}
                  onStop={setStopTarget}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {stopTarget && (
        <StopDialog
          driver={stopTarget}
          onConfirm={handleStop}
          onCancel={() => setStopTarget(null)}
        />
      )}
    </div>
  );
}
