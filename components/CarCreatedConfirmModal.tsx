import React, { useId } from 'react';
import type { VehicleCreateInput } from '../taxiTypes';
import { formatInteger, formatNumber } from '../utils/taxiFormat';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

const fmt = formatNumber;
const fmtInt = formatInteger;

export interface CarCreatedSummary extends VehicleCreateInput {
  label: string;
  ownerName: string;
}

interface CarCreatedConfirmModalProps {
  open: boolean;
  summary: CarCreatedSummary | null;
  onStayInGarage: () => void;
  onOpenCar: () => void;
}

const CarCreatedConfirmModal: React.FC<CarCreatedConfirmModalProps> = ({
  open,
  summary,
  onStayInGarage,
  onOpenCar,
}) => {
  const titleId = useId();
  const descId = useId();

  if (!open || !summary) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'اسم السيارة', value: summary.label },
    { label: 'مالك السيارة', value: summary.ownerName },
  ];
  if (summary.currentDriverName?.trim()) {
    rows.push({ label: 'السائق', value: summary.currentDriverName.trim() });
  }
  rows.push(
    { label: 'الضمان الشهري', value: `${fmt(summary.monthlyGuarantee ?? 750)} د.أ` },
    { label: 'تكلفة السيارة', value: `${fmt(summary.vehicleCost ?? 0)} د.أ` },
    { label: 'مدة قبل الشطب', value: `${fmtInt(summary.vehicleLifeYears ?? 7)} سنوات` }
  );
  if (summary.vehicleImage) {
    rows.push({ label: 'صورة السيارة', value: '✓ تم رفع صورة' });
  }

  return (
    <AppModal
      open={open}
      onClose={onStayInGarage}
      size="md"
      zIndex={110}
      panelClassName="border border-green-200"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <AppModalHeader className="!bg-green-50/80 !border-green-100 rounded-t-2xl">
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 w-11 h-11 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl font-bold"
            aria-hidden
          >
            ✓
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              تم إنشاء السيارة بنجاح
            </h2>
            <p id={descId} className="text-sm text-slate-600 mt-1">
              تم حفظ البيانات — ملخص السيارة الجديدة:
            </p>
          </div>
        </div>
      </AppModalHeader>

      <AppModalBody className="!pt-4">
        <dl className="car-created-summary space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-sm text-slate-500">{row.label}</dt>
              <dd className="text-sm font-semibold text-slate-900 tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </AppModalBody>

      <AppModalFooter>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-3">
          <button
            type="button"
            onClick={onStayInGarage}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
          >
            البقاء في الأسطول
          </button>
          <button
            type="button"
            onClick={onOpenCar}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
          >
            فتح السيارة للمتابعة
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
};

export default CarCreatedConfirmModal;
