import React, { useRef, useState } from 'react';
import type { VehicleListItem } from '../taxiTypes';
import { formatNumber, formatInteger } from '../utils/taxiFormat';
import { fileToVehicleImageDataUrl } from '../utils/vehicleImage';
import DeleteCarConfirmModal from './DeleteCarConfirmModal';

const fmt = formatNumber;
const fmtInt = formatInteger;

interface VehicleGarageProps {
  vehicles: VehicleListItem[];
  onSelect: (vehicleId: string) => void;
  onAddVehicle: (label: string, vehicleImage: string) => Promise<void>;
  onDeleteVehicle?: (vehicleId: string) => Promise<boolean>;
}

const VehicleGarage: React.FC<VehicleGarageProps> = ({
  vehicles,
  onSelect,
  onAddVehicle,
  onDeleteVehicle,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newImage, setNewImage] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VehicleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      await onAddVehicle(label, newImage);
      setNewLabel('');
      setNewImage('');
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  };

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToVehicleImageDataUrl(file);
      setNewImage(dataUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const openDeleteModal = (vehicle: VehicleListItem) => {
    setDeleteSuccessMessage(null);
    setDeleteTarget(vehicle);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDeleteVehicle) return;
    setDeleting(true);
    try {
      const ok = await onDeleteVehicle(deleteTarget.id);
      if (ok) {
        setDeleteTarget(null);
        setDeleteSuccessMessage('تم حذف بطاقة السيارة بنجاح.');
        window.setTimeout(() => setDeleteSuccessMessage(null), 5000);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="vehicle-garage space-y-6">
      {deleteSuccessMessage && (
        <div
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium"
          role="status"
        >
          {deleteSuccessMessage}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">أسطول VIP limousine CARS</h2>
          <p className="text-sm text-slate-500 mt-1">
            اختر سيارة لعرض المتابعة والملخص والتأمين والترخيص — كل سيارة ببياناتها المستقلة
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm shrink-0"
        >
          <span className="text-lg leading-none">+</span>
          إضافة سيارة جديدة
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="vehicle-garage-add-form app-surface border border-slate-200 rounded-xl p-5 shadow-sm space-y-4"
        >
          <h3 className="font-semibold text-slate-800">سيارة جديدة</h3>
          <label className="block">
            <span className="text-sm text-slate-600">اسم السيارة</span>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="مثال: Mercedes S-Class"
              required
              autoFocus
            />
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
            >
              رفع صورة
            </button>
            {newImage && (
              <img src={newImage} alt="" className="w-20 h-14 object-cover rounded-lg border" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => void handleImageFile(e.target.files?.[0])}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {adding ? 'جاري الإضافة...' : 'حفظ وإنشاء'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {vehicles.length === 0 ? (
        <div className="text-center py-16 app-surface border border-dashed border-slate-300 rounded-xl">
          <p className="text-slate-600 mb-4">لا توجد سيارات بعد</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium"
          >
            إضافة أول سيارة
          </button>
        </div>
      ) : (
        <div className="vehicle-garage-grid">
          {vehicles.map((v) => (
            <article
              key={v.id}
              className="vehicle-garage-card"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(v.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(v.id);
                }
              }}
            >
              <div className="vehicle-garage-card-photo">
                {v.vehicleImage ? (
                  <img src={v.vehicleImage} alt="" />
                ) : (
                  <span className="vehicle-garage-card-photo-placeholder" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 17h14l-1.5-5.5a2 2 0 00-1.9-1.4H8.4a2 2 0 00-1.9 1.4L5 17z" />
                      <circle cx="7.5" cy="17.5" r="1.5" />
                      <circle cx="16.5" cy="17.5" r="1.5" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="vehicle-garage-card-body">
                <h3 className="font-bold text-slate-900 truncate">{v.label}</h3>
                {v.currentDriverName && (
                  <p className="text-xs text-slate-500 truncate">السائق: {v.currentDriverName}</p>
                )}
                <table className="vehicle-garage-card-stats-table" aria-label="ملخص السيارة">
                  <thead>
                    <tr>
                      <th scope="col">صافي الربح</th>
                      <th scope="col">إيرادات</th>
                      <th scope="col">أشهر</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span
                          className={`vehicle-garage-stat-value ${
                            v.netProfit >= 0
                              ? 'vehicle-garage-stat-value--profit'
                              : 'vehicle-garage-stat-value--loss'
                          }`}
                        >
                          <span className="tabular-nums">{fmt(v.netProfit)}</span>
                          <span className="vehicle-garage-stat-currency">د.أ</span>
                        </span>
                      </td>
                      <td>
                        <span className="vehicle-garage-stat-value vehicle-garage-stat-value--revenue tabular-nums">
                          {fmt(v.totalRevenue)}
                        </span>
                      </td>
                      <td>
                        <span className="vehicle-garage-stat-value vehicle-garage-stat-value--months tabular-nums">
                          {fmtInt(v.entryCount)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <span className="vehicle-garage-card-open-btn">فتح للمتابعة</span>
              </div>
              {onDeleteVehicle && vehicles.length > 1 && (
                <button
                  type="button"
                  className="vehicle-garage-card-delete"
                  title="حذف السيارة"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(v);
                  }}
                >
                  ×
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      <DeleteCarConfirmModal
        open={deleteTarget != null}
        carName={deleteTarget?.label ?? ''}
        deleting={deleting}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default VehicleGarage;
