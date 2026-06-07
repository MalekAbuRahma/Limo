/**
 * DriverHistoryPanel — shows all drivers for a vehicle with FROM/TO dates.
 * Allows stopping the current driver and adding a new one.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  VehicleDriver,
  fetchVehicleDrivers,
  addVehicleDriverApi,
  stopVehicleDriverApi,
  deleteVehicleDriverApi,
} from '../utils/taxiApi';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── sub-components ───────────────────────────────────────────────────────────

interface StopDialogProps {
  driver: VehicleDriver;
  onConfirm: (endDate: string) => void;
  onCancel: () => void;
}

function StopDialog({ driver, onConfirm, onCancel }: StopDialogProps) {
  const [endDate, setEndDate] = useState(todayIso());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-bold text-slate-800">إيقاف السائق: {driver.name}</h3>
        <div>
          <label className="block text-sm text-slate-600 mb-1">تاريخ آخر يوم عمل</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!endDate}
            onClick={() => onConfirm(endDate)}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            تأكيد الإيقاف
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddDriverFormProps {
  suggestedDate?: string;
  onSave: (name: string, startDate: string, notes: string) => void;
  onCancel: () => void;
  saving: boolean;
}

function AddDriverForm({ suggestedDate, onSave, onCancel, saving }: AddDriverFormProps) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(suggestedDate ?? todayIso());
  const [notes, setNotes] = useState('');
  const nameErr = !name.trim() ? 'اسم السائق مطلوب' : '';
  const dateErr = !startDate ? 'تاريخ أول دفعة مطلوب' : '';

  function submit() {
    if (nameErr || dateErr) return;
    onSave(name.trim(), startDate, notes.trim());
  }

  return (
    <div className="border border-blue-200 bg-blue-50/60 rounded-xl p-4 space-y-3" dir="rtl">
      <p className="text-sm font-semibold text-blue-900">إضافة سائق جديد</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">اسم السائق *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: محمد علي"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          {nameErr && <p className="text-xs text-red-500 mt-0.5">{nameErr}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">تاريخ أول دفعة *</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {dateErr && <p className="text-xs text-red-500 mt-0.5">{dateErr}</p>}
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">ملاحظات (اختياري)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="أي ملاحظات إضافية..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !!nameErr || !!dateErr}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '...جاري الحفظ' : 'حفظ السائق'}
        </button>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface DriverHistoryPanelProps {
  vehicleId: string;
  /** Called after any change so the parent can refresh its state if needed */
  onDriversChanged?: (activeDriver: VehicleDriver | null) => void;
  className?: string;
}

export function DriverHistoryPanel({
  vehicleId,
  onDriversChanged,
  className = '',
}: DriverHistoryPanelProps) {
  const [drivers, setDrivers] = useState<VehicleDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopTarget, setStopTarget] = useState<VehicleDriver | null>(null);

  const activeDriver = drivers.find((d) => !d.endDate) ?? null;
  const hasActive = !!activeDriver;

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

  useEffect(() => {
    load();
  }, [load]);

  const notifyParent = useCallback(
    (list: VehicleDriver[]) => {
      const active = list.find((d) => !d.endDate) ?? null;
      onDriversChanged?.(active);
    },
    [onDriversChanged]
  );

  async function handleAdd(name: string, startDate: string, notes: string) {
    setSaving(true);
    setError(null);
    try {
      const added = await addVehicleDriverApi(vehicleId, { name, startDate, notes });
      if (added) {
        const updated = [...drivers, added].sort((a, b) =>
          b.startDate.localeCompare(a.startDate)
        );
        setDrivers(updated);
        notifyParent(updated);
      }
      setShowAdd(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل إضافة السائق');
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
        const newList = drivers.map((d) => (d.id === updated.id ? updated : d));
        setDrivers(newList);
        notifyParent(newList);
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
      const newList = drivers.filter((d) => d.id !== driver.id);
      setDrivers(newList);
      notifyParent(newList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل حذف السائق');
    } finally {
      setSaving(false);
    }
  }

  // Suggest next start = day after last driver's end_date (or today)
  const suggestedStart = (() => {
    const stopped = drivers.find((d) => d.endDate);
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
          <p className="text-xs text-slate-500">
            كل سائق له تاريخ بداية (أول دفعة) وتاريخ نهاية اختياري
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={showAdd || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span>
          إضافة سائق
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <AddDriverForm
          suggestedDate={hasActive ? todayIso() : suggestedStart}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {/* Drivers table */}
      {loading ? (
        <p className="text-xs text-slate-400 py-4 text-center">جاري التحميل...</p>
      ) : drivers.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-500">لا يوجد سائقون مسجّلون</p>
          <p className="text-xs text-slate-400 mt-1">اضغط «إضافة سائق» لتسجيل أول سائق</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" dir="rtl">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">#</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  اسم السائق
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  من (تاريخ أول دفعة)
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  إلى
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  الحالة
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((d, i) => {
                const isActive = !d.endDate;
                return (
                  <tr
                    key={d.id}
                    className={isActive ? 'bg-green-50/60' : 'bg-white hover:bg-slate-50'}
                  >
                    <td className="px-3 py-2.5 text-xs text-slate-400 tabular-nums">
                      {drivers.length - i}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{d.name}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                      {formatDate(d.startDate)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                      {isActive ? (
                        <span className="text-green-600 font-medium">نشط</span>
                      ) : (
                        formatDate(d.endDate)
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          نشط حالياً
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                          منتهي
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => setStopTarget(d)}
                            disabled={saving}
                            title="إيقاف السائق"
                            className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            إيقاف
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          disabled={saving}
                          title="حذف"
                          className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stop dialog */}
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
