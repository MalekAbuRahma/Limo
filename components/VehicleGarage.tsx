import React, { useEffect, useRef, useState } from 'react';
import type { AssignableUser, VehicleCreateInput, VehicleListItem } from '../taxiTypes';
import { DEFAULT_SETTINGS } from '../taxiTypes';
import { fetchAssignableUsers } from '../utils/authApi';
import { canDeleteImmediately, isAdmin } from '../utils/permissions';
import type { UserSession } from '../utils/taxiAuth';
import { formatNumber, formatInteger } from '../utils/taxiFormat';
import type { UiLanguage } from './TaxiLogin';
import {
  fileToVehicleImageDataUrl,
  hasVehicleImage,
  VEHICLE_IMAGE_REQUIRED_MSG,
} from '../utils/vehicleImage';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';
import CarCreatedConfirmModal, { type CarCreatedSummary } from './CarCreatedConfirmModal';
import DeleteCarConfirmModal from './DeleteCarConfirmModal';

const fmt = formatNumber;
const fmtInt = formatInteger;

interface VehicleGarageProps {
  session: UserSession;
  lang: UiLanguage;
  vehicles: VehicleListItem[];
  onSelect: (vehicleId: string) => void;
  onAddVehicle: (input: VehicleCreateInput) => Promise<string>;
  onDeleteVehicle?: (vehicleId: string) => Promise<boolean>;
}

const VehicleGarage: React.FC<VehicleGarageProps> = ({
  session,
  lang,
  vehicles,
  onSelect,
  onAddVehicle,
  onDeleteVehicle,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newImage, setNewImage] = useState('');
  const [newGuarantee, setNewGuarantee] = useState(DEFAULT_SETTINGS.monthlyGuarantee);
  const [newDriver, setNewDriver] = useState('');
  const [newCost, setNewCost] = useState(DEFAULT_SETTINGS.vehicleCost);
  const [newLifeYears, setNewLifeYears] = useState(DEFAULT_SETTINGS.vehicleLifeYears);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VehicleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<CarCreatedSummary | null>(null);
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addFormError, setAddFormError] = useState('');
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const adminCreates = canDeleteImmediately(session);

  useEffect(() => {
    if (!showAdd) return;
    void fetchAssignableUsers().then((users) => {
      setAssignableUsers(users);
      setAssignedUserId((prev) => {
        if (prev) return prev;
        if (!adminCreates) return session.id;
        return users[0]?.id ?? '';
      });
    });
  }, [showAdd, session.id, adminCreates]);

  const resetAddForm = () => {
    setNewLabel('');
    setNewOwner('');
    setNewImage('');
    setNewGuarantee(DEFAULT_SETTINGS.monthlyGuarantee);
    setNewDriver('');
    setNewCost(DEFAULT_SETTINGS.vehicleCost);
    setNewLifeYears(DEFAULT_SETTINGS.vehicleLifeYears);
    setImageError('');
    setAddFormError('');
    setAssignedUserId(adminCreates ? '' : session.id);
  };

  const closeAddModal = () => {
    if (adding) return;
    setShowAdd(false);
    resetAddForm();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    const ownerName = newOwner.trim();
    if (!label || !ownerName) return;
    if (!hasVehicleImage(newImage)) {
      setImageError(VEHICLE_IMAGE_REQUIRED_MSG);
      return;
    }

    const userId = adminCreates ? assignedUserId : session.id;
    if (!userId) {
      setAddFormError(
        lang === 'ar' ? 'اختر المستخدم المسؤول عن السيارة' : 'Select the user for this vehicle'
      );
      return;
    }

    const payload: VehicleCreateInput = {
      label,
      ownerName,
      vehicleImage: newImage,
      monthlyGuarantee: newGuarantee,
      currentDriverName: newDriver.trim(),
      vehicleCost: newCost,
      vehicleLifeYears: newLifeYears,
      assignedUserId: userId,
    };

    setAdding(true);
    setAddFormError('');
    try {
      const id = await onAddVehicle(payload);
      setShowAdd(false);
      resetAddForm();
      setCreatedSummary({ ...payload, label, ownerName });
      setCreatedVehicleId(id);
    } catch (err) {
      setAddFormError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
            ? 'تعذّر إنشاء السيارة'
            : 'Could not create vehicle'
      );
    } finally {
      setAdding(false);
    }
  };

  const closeCreatedConfirm = () => {
    setCreatedSummary(null);
    setCreatedVehicleId(null);
  };

  const openCreatedCar = () => {
    if (createdVehicleId) onSelect(createdVehicleId);
    closeCreatedConfirm();
  };

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToVehicleImageDataUrl(file);
      setNewImage(dataUrl);
      setImageError('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setImageError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
            ? 'تعذّر رفع الصورة'
            : 'Could not upload image'
      );
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
        setDeleteSuccessMessage(
          canDeleteImmediately(session)
            ? lang === 'ar'
              ? 'تم حذف بطاقة السيارة بنجاح.'
              : 'Vehicle removed successfully.'
            : lang === 'ar'
              ? 'تم إرسال طلب الحذف — بانتظار موافقة المدير.'
              : 'Deletion request sent — awaiting admin approval.'
        );
        window.setTimeout(() => setDeleteSuccessMessage(null), 5000);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="vehicle-garage">
      {deleteSuccessMessage && (
        <div
          className="vehicle-garage-toast"
          role="status"
        >
          {deleteSuccessMessage}
        </div>
      )}

      <header className="vehicle-garage-header">
        <div className="vehicle-garage-header__row">
          <div className="vehicle-garage-header__text">
            <h2 className="vehicle-garage-header__title">
              {lang === 'ar' ? 'أسطول VIP limousine CARS' : 'VIP limousine CARS fleet'}
            </h2>
            <p className="vehicle-garage-header__subtitle">
              {lang === 'ar'
                ? 'اختر سيارة لعرض المتابعة والملخص والتأمين والترخيص — كل سيارة ببياناتها المستقلة'
                : 'Select a vehicle for tracking, summary, insurance, and licenses — each car has its own data'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="vehicle-garage-header__add"
          >
            <span aria-hidden>+</span>
            {lang === 'ar' ? 'إضافة سيارة' : 'Add vehicle'}
          </button>
        </div>
      </header>

      <AppModal
        open={showAdd}
        onClose={closeAddModal}
        size="lg"
        zIndex={100}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        closeOnBackdrop={!adding}
        panelClassName="vehicle-garage-add-form app-surface border border-slate-200"
        aria-labelledby="add-car-title"
      >
        <form
          className="flex flex-col min-h-0 overflow-hidden"
          noValidate
          onSubmit={(e) => void handleAdd(e)}
        >
          <AppModalHeader>
            <h3 id="add-car-title" className="font-semibold text-slate-800 text-lg">
              سيارة جديدة
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              كل سيارة لها إعداداتها الخاصة (ضمان، تكلفة، مدة شطب) — لا تؤثر على السيارات الأخرى
            </p>
          </AppModalHeader>
          <AppModalBody className="space-y-4 !pt-4">
            {addFormError && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {addFormError}
              </div>
            )}
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
            <label className="block">
              <span className="text-sm text-slate-600">مالك السيارة</span>
              <input
                type="text"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                placeholder="مثال: محمد أحمد"
                required
              />
              <p className="text-xs text-slate-500 mt-1">يظهر كوسم (Tag) على بطاقة السيارة</p>
            </label>
            {adminCreates ? (
              <label className="block">
                <span className="text-sm text-slate-600">
                  {lang === 'ar' ? 'المستخدم المسؤول' : 'Assigned user'}{' '}
                  <span className="text-red-600">*</span>
                </span>
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  required
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">
                    {lang === 'ar' ? '— اختر مستخدماً —' : '— Select user —'}
                  </option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {lang === 'ar'
                    ? 'يرى هذا المستخدم السيارة فقط في مرآبه'
                    : 'Only this user will see the car in their garage'}
                </p>
              </label>
            ) : (
              <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-900">
                {lang === 'ar' ? 'تُسجَّل السيارة تحت حسابك:' : 'This car will be assigned to:'}{' '}
                <strong>{session.displayName}</strong>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-600">الضمان الشهري (د.أ)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newGuarantee}
                  onChange={(e) => setNewGuarantee(Number(e.target.value) || 0)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">اسم السائق</span>
                <input
                  type="text"
                  value={newDriver}
                  onChange={(e) => setNewDriver(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="اختياري"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">تكلفة السيارة (د.أ)</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={newCost}
                  onChange={(e) => setNewCost(Number(e.target.value) || 0)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">مدة قبل الشطب (سنوات)</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={newLifeYears}
                  onChange={(e) => setNewLifeYears(Number(e.target.value) || 7)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
            </div>
            <div>
              <span className="text-sm text-slate-600">
                صورة السيارة <span className="text-red-600">*</span>
              </span>
              <div className="flex items-center gap-4 mt-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`px-4 py-2 border rounded-lg text-sm hover:bg-slate-50 ${
                    imageError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  }`}
                >
                  {newImage ? 'تغيير الصورة' : 'رفع صورة'}
                </button>
                {newImage && (
                  <img src={newImage} alt="" className="w-20 h-14 object-cover rounded-lg border" />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => void handleImageFile(e.target.files?.[0])}
                />
              </div>
              {imageError && <p className="text-xs text-red-600 mt-1">{imageError}</p>}
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="flex gap-2 pt-3">
              <button
                type="submit"
                disabled={
                  adding ||
                  !hasVehicleImage(newImage) ||
                  (adminCreates && !assignedUserId)
                }
                className="flex-1 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
              >
                {adding ? 'جاري الإضافة...' : 'حفظ وإنشاء'}
              </button>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={adding}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-60"
              >
                إلغاء
              </button>
            </div>
          </AppModalFooter>
        </form>
      </AppModal>

      {vehicles.length === 0 ? (
        <div className="vehicle-garage-empty">
          <div className="vehicle-garage-empty__content">
            {isAdmin(session) ? (
              <>
                <p className="vehicle-garage-empty__message">
                  {lang === 'ar' ? 'لا توجد سيارات بعد' : 'No vehicles yet'}
                </p>
                <button type="button" onClick={() => setShowAdd(true)} className="vehicle-garage-header__add">
                  {lang === 'ar' ? 'إضافة أول سيارة' : 'Add first vehicle'}
                </button>
              </>
            ) : (
              <p className="vehicle-garage-empty__message">
                {lang === 'ar'
                  ? 'لا توجد سيارات مسندة لحسابك. المدير يعيّن السيارات من الإعدادات ← المستخدمون، أو عند إضافة سيارة جديدة.'
                  : 'No vehicles assigned to you. An admin assigns cars under Settings → Users, or when adding a new car.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className="vehicle-garage-grid"
          data-count={vehicles.length <= 2 ? String(vehicles.length) : 'many'}
        >
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
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-900 truncate">{v.label}</h3>
                  {v.ownerName && (
                    <span className="vehicle-owner-tag" title="مالك السيارة">
                      {v.ownerName}
                    </span>
                  )}
                  {v.assignedUserDisplayName && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-800"
                      title={lang === 'ar' ? 'المستخدم المسؤول' : 'Assigned user'}
                    >
                      {v.assignedUserDisplayName}
                    </span>
                  )}
                </div>
                {v.currentDriverName && (
                  <p className="text-xs text-slate-500 truncate">السائق: {v.currentDriverName}</p>
                )}
                {(v.cardProperties ?? []).length > 0 && (
                  <ul className="vehicle-garage-card-props" aria-label="خصائص السيارة">
                    {(v.cardProperties ?? []).map((prop) => (
                      <li
                        key={prop.id}
                        className={`vehicle-garage-card-prop vehicle-garage-card-prop--${prop.tone}`}
                      >
                        <span className="vehicle-garage-card-prop__label">{prop.label}</span>
                        <span className="vehicle-garage-card-prop__value">{prop.value}</span>
                        {prop.hint && (
                          <span className="vehicle-garage-card-prop__hint">{prop.hint}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="vehicle-garage-card-stats" role="group" aria-label="ملخص السيارة">
                  <div className="vehicle-garage-card-stat">
                    <span className="vehicle-garage-card-stat__label">صافي الربح</span>
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
                  </div>
                  <div className="vehicle-garage-card-stat">
                    <span className="vehicle-garage-card-stat__label">إيرادات</span>
                    <span className="vehicle-garage-stat-value vehicle-garage-stat-value--revenue tabular-nums">
                      {fmt(v.totalRevenue)}
                    </span>
                  </div>
                  <div className="vehicle-garage-card-stat">
                    <span className="vehicle-garage-card-stat__label">أشهر</span>
                    <span className="vehicle-garage-stat-value vehicle-garage-stat-value--months tabular-nums">
                      {fmtInt(v.entryCount)}
                    </span>
                  </div>
                </div>
                <span className="vehicle-garage-card-open-btn">
                  {lang === 'ar' ? 'فتح للمتابعة' : 'Open'}
                </span>
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

      <CarCreatedConfirmModal
        open={createdSummary != null}
        summary={createdSummary}
        onStayInGarage={closeCreatedConfirm}
        onOpenCar={openCreatedCar}
      />

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
